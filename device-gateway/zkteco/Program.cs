using System;
using System.Collections.Generic;
using System.Collections.Concurrent;
using System.IO;
using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using libzkfpcsharp;

namespace Brunovia.ZKTecoGateway
{
    internal sealed class CaptureRequest
    {
        public string employeeId { get; set; }
        public string purpose { get; set; }
        public string deviceId { get; set; }
    }

    internal static class Program
    {
        private const string Prefix = "http://127.0.0.1:8787/";
        private const int TemplateSize = 2048;
        private static readonly JavaScriptSerializer Json = new JavaScriptSerializer();
        private static readonly object ScannerLock = new object();
        private static readonly ConcurrentDictionary<string, object> Progress = new ConcurrentDictionary<string, object>();
        private static readonly string StorePath = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "Brunovia", "ZKTeco", "templates.json");

        [STAThread]
        public static void Main()
        {
            Directory.CreateDirectory(Path.GetDirectoryName(StorePath));
            using (var listener = new HttpListener())
            {
                listener.Prefixes.Add(Prefix);
                listener.Start();
                Console.WriteLine("Brunovia ZKTeco gateway listening on " + Prefix);
                Console.WriteLine("Templates are encrypted for this Windows account.");
                while (true)
                {
                    var context = listener.GetContext();
                    Handle(context);
                }
            }
        }

        private static void Handle(HttpListenerContext context)
        {
            try
            {
                AddCors(context);
                if (context.Request.HttpMethod == "OPTIONS") { Respond(context, 204, null); return; }
                if (context.Request.HttpMethod == "GET" && context.Request.Url.AbsolutePath == "/health")
                {
                    var init = zkfp2.Init();
                    var count = init == zkfperrdef.ZKFP_ERR_OK ? zkfp2.GetDeviceCount() : 0;
                    if (init == zkfperrdef.ZKFP_ERR_OK) zkfp2.Terminate();
                    Respond(context, count > 0 ? 200 : 503, new { status = count > 0 ? "ready" : "scanner_unavailable", vendor = "ZKTECO", model = "SLK20R", deviceCount = count });
                    return;
                }
                if (context.Request.HttpMethod == "GET" && context.Request.Url.AbsolutePath == "/v1/fingerprints/progress")
                {
                    var employeeId = context.Request.QueryString["employeeId"];
                    object progress;
                    if (!String.IsNullOrWhiteSpace(employeeId) && Progress.TryGetValue(employeeId, out progress))
                        Respond(context, 200, progress);
                    else
                        Respond(context, 200, new { stage = "IDLE", scan = 0, message = "Ready to begin" });
                    return;
                }
                if (context.Request.HttpMethod == "POST" && context.Request.Url.AbsolutePath == "/v1/fingerprints/capture")
                {
                    string body;
                    using (var reader = new StreamReader(context.Request.InputStream, context.Request.ContentEncoding)) body = reader.ReadToEnd();
                    var request = Json.Deserialize<CaptureRequest>(body);
                    if (request == null ||
                        (request.purpose != "ENROLL" && request.purpose != "VERIFY" && request.purpose != "IDENTIFY") ||
                        (request.purpose != "IDENTIFY" && String.IsNullOrWhiteSpace(request.employeeId)))
                        throw new ArgumentException("A valid purpose and employeeId for enrollment or verification are required");
                    object result;
                    lock (ScannerLock) result = Capture(request);
                    Respond(context, 200, result);
                    return;
                }
                Respond(context, 404, new { error = "not_found" });
            }
            catch (Exception error)
            {
                Respond(context, error is ArgumentException ? 400 : 500, new { error = error.Message });
            }
        }

        private static object Capture(CaptureRequest request)
        {
            var ret = zkfp2.Init();
            if (ret != zkfperrdef.ZKFP_ERR_OK) throw new InvalidOperationException("ZKFinger SDK initialization failed: " + ret);
            IntPtr device = IntPtr.Zero;
            IntPtr database = IntPtr.Zero;
            try
            {
                if (zkfp2.GetDeviceCount() < 1) throw new InvalidOperationException("SLK20R is not connected");
                device = zkfp2.OpenDevice(0);
                if (device == IntPtr.Zero) throw new InvalidOperationException("SLK20R could not be opened");
                database = zkfp2.DBInit();
                if (database == IntPtr.Zero) throw new InvalidOperationException("ZKFinger matcher could not be initialized");

                var widthBytes = new byte[4]; var size = 4; var width = 0;
                zkfp2.GetParameters(device, 1, widthBytes, ref size); zkfp2.ByteArray2Int(widthBytes, ref width);
                var heightBytes = new byte[4]; size = 4; var height = 0;
                zkfp2.GetParameters(device, 2, heightBytes, ref size); zkfp2.ByteArray2Int(heightBytes, ref height);
                var image = new byte[width * height];

                byte[] finalTemplate;
                var confidence = 0;
                if (request.purpose == "ENROLL")
                {
                    var samples = new byte[3][];
                    for (var index = 0; index < 3; index++)
                    {
                        SetProgress(request.employeeId, "PLACE_FINGER", index + 1, "Place the right index finger on the scanner");
                        samples[index] = ReadFinger(device, image);
                        SetProgress(request.employeeId, "LIFT_FINGER", index + 1, "Scan accepted. Lift the finger from the scanner");
                        if (index > 0 && zkfp2.DBMatch(database, samples[index - 1], samples[index]) <= 0)
                            throw new InvalidOperationException("Enrollment scans did not use the same finger");
                        if (index < 2) WaitForFingerRemoval(device, image);
                    }
                    SetProgress(request.employeeId, "PROCESSING", 3, "All three scans received. Creating the enrollment");
                    finalTemplate = new byte[TemplateSize];
                    var finalLength = TemplateSize;
                    ret = zkfp2.DBMerge(database, samples[0], samples[1], samples[2], finalTemplate, ref finalLength);
                    if (ret != zkfperrdef.ZKFP_ERR_OK) throw new InvalidOperationException("Fingerprint enrollment merge failed: " + ret);
                    Array.Resize(ref finalTemplate, finalLength);
                    SaveTemplate(request.employeeId, finalTemplate);
                    confidence = 100;
                    SetProgress(request.employeeId, "COMPLETED", 3, "Fingerprint enrollment completed");
                }
                else if (request.purpose == "VERIFY")
                {
                    var stored = LoadTemplate(request.employeeId);
                    if (stored == null) throw new InvalidOperationException("No fingerprint is enrolled for this employee");
                    SetProgress(request.employeeId, "PLACE_FINGER", 1, "Place the enrolled finger flat on the scanner");
                    var captured = ReadFinger(device, image);
                    SetProgress(request.employeeId, "PROCESSING", 1, "Fingerprint received. Keep still while it is verified");
                    confidence = zkfp2.DBMatch(database, captured, stored);
                    if (confidence <= 0) throw new InvalidOperationException("Fingerprint did not match this employee");
                    finalTemplate = stored;
                    SetProgress(request.employeeId, "COMPLETED", 1, "Fingerprint verified successfully");
                }
                else
                {
                    var templates = ReadStore();
                    if (templates.Count == 0) throw new InvalidOperationException("No employee fingerprints are enrolled on this scanner computer");
                    SetProgress("attendance", "PLACE_FINGER", 1, "Place an enrolled finger flat on the scanner");
                    var captured = ReadFinger(device, image);
                    SetProgress("attendance", "PROCESSING", 1, "Fingerprint received. Identifying employee");
                    string matchedEmployee = null;
                    foreach (var entry in templates)
                    {
                        var stored = ProtectedData.Unprotect(Convert.FromBase64String(entry.Value), Encoding.UTF8.GetBytes("Brunovia-ZKTeco-v1"), DataProtectionScope.CurrentUser);
                        var score = zkfp2.DBMatch(database, captured, stored);
                        if (score > confidence) { confidence = score; matchedEmployee = entry.Key; }
                    }
                    if (String.IsNullOrWhiteSpace(matchedEmployee) || confidence <= 0)
                        throw new InvalidOperationException("Fingerprint is not enrolled for an active employee");
                    request.employeeId = matchedEmployee;
                    finalTemplate = captured;
                    SetProgress("attendance", "COMPLETED", 1, "Employee identified successfully");
                }

                return new {
                    captureId = Guid.NewGuid().ToString(),
                    templateReference = "zkteco:slk20r:" + request.employeeId,
                    confidence = confidence,
                    deviceId = String.IsNullOrWhiteSpace(request.deviceId) ? "SLK20R-0" : request.deviceId,
                    capturedAt = DateTime.UtcNow.ToString("o"),
                    employeeId = request.employeeId
                };
            }
            finally
            {
                if (database != IntPtr.Zero) zkfp2.DBFree(database);
                if (device != IntPtr.Zero) zkfp2.CloseDevice(device);
                zkfp2.Terminate();
            }
        }

        private static void SetProgress(string employeeId, string stage, int scan, string message)
        {
            Progress[employeeId] = new { stage = stage, scan = scan, message = message };
        }

        private static byte[] ReadFinger(IntPtr device, byte[] image)
        {
            var deadline = DateTime.UtcNow.AddSeconds(20);
            while (DateTime.UtcNow < deadline)
            {
                var template = new byte[TemplateSize];
                var length = TemplateSize;
                if (zkfp2.AcquireFingerprint(device, image, template, ref length) == zkfperrdef.ZKFP_ERR_OK)
                {
                    Array.Resize(ref template, length);
                    return template;
                }
                Thread.Sleep(150);
            }
            throw new TimeoutException("Fingerprint scan timed out");
        }

        private static void WaitForFingerRemoval(IntPtr device, byte[] image)
        {
            var clearReads = 0;
            var deadline = DateTime.UtcNow.AddSeconds(12);
            while (DateTime.UtcNow < deadline)
            {
                var template = new byte[TemplateSize]; var length = TemplateSize;
                if (zkfp2.AcquireFingerprint(device, image, template, ref length) != zkfperrdef.ZKFP_ERR_OK) clearReads++; else clearReads = 0;
                if (clearReads >= 3) return;
                Thread.Sleep(150);
            }
            throw new TimeoutException("Lift the finger between enrollment scans");
        }

        private static Dictionary<string, string> ReadStore()
        {
            if (!File.Exists(StorePath)) return new Dictionary<string, string>();
            return Json.Deserialize<Dictionary<string, string>>(File.ReadAllText(StorePath)) ?? new Dictionary<string, string>();
        }

        private static void SaveTemplate(string employeeId, byte[] template)
        {
            var store = ReadStore();
            var protectedBytes = ProtectedData.Protect(template, Encoding.UTF8.GetBytes("Brunovia-ZKTeco-v1"), DataProtectionScope.CurrentUser);
            store[employeeId] = Convert.ToBase64String(protectedBytes);
            File.WriteAllText(StorePath, Json.Serialize(store), Encoding.UTF8);
        }

        private static byte[] LoadTemplate(string employeeId)
        {
            var store = ReadStore(); string value;
            if (!store.TryGetValue(employeeId, out value)) return null;
            return ProtectedData.Unprotect(Convert.FromBase64String(value), Encoding.UTF8.GetBytes("Brunovia-ZKTeco-v1"), DataProtectionScope.CurrentUser);
        }

        private static void AddCors(HttpListenerContext context)
        {
            var origin = context.Request.Headers["Origin"];
            if (IsLocalOrigin(origin))
                context.Response.Headers["Access-Control-Allow-Origin"] = origin;
            context.Response.Headers["Vary"] = "Origin";
            context.Response.Headers["Access-Control-Allow-Headers"] = "Content-Type";
            context.Response.Headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS";
            context.Response.Headers["Access-Control-Allow-Private-Network"] = "true";
        }

        private static bool IsLocalOrigin(string origin)
        {
            Uri uri;
            if (String.IsNullOrWhiteSpace(origin) || !Uri.TryCreate(origin, UriKind.Absolute, out uri)) return false;
            if (uri.Scheme != Uri.UriSchemeHttp && uri.Scheme != Uri.UriSchemeHttps) return false;
            if (uri.Scheme == Uri.UriSchemeHttps &&
                (String.Equals(uri.Host, "brunovia.xyz", StringComparison.OrdinalIgnoreCase) ||
                 String.Equals(uri.Host, "www.brunovia.xyz", StringComparison.OrdinalIgnoreCase)))
                return true;
            if (uri.IsLoopback || String.Equals(uri.Host, Environment.MachineName, StringComparison.OrdinalIgnoreCase)) return true;
            IPAddress originAddress;
            if (!IPAddress.TryParse(uri.Host, out originAddress)) return false;
            foreach (var localAddress in Dns.GetHostAddresses(Dns.GetHostName()))
                if (originAddress.Equals(localAddress)) return true;
            return false;
        }

        private static void Respond(HttpListenerContext context, int status, object value)
        {
            if (context.Response.OutputStream == null) return;
            context.Response.StatusCode = status;
            if (value != null)
            {
                var bytes = Encoding.UTF8.GetBytes(Json.Serialize(value));
                context.Response.ContentType = "application/json; charset=utf-8";
                context.Response.ContentLength64 = bytes.Length;
                context.Response.OutputStream.Write(bytes, 0, bytes.Length);
            }
            context.Response.Close();
        }
    }
}
