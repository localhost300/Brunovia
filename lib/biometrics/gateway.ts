export type BiometricVendor = "ZKTECO" | "SUPREMA" | "HIKVISION";
export type CapturePurpose = "ENROLL" | "VERIFY";
export interface CaptureRequest {
  employeeId?: string;
  purpose: CapturePurpose;
  deviceId: string;
}
export interface CaptureResult {
  captureId: string;
  templateReference: string;
  confidence: number;
  deviceId: string;
  capturedAt: string;
}
export interface EnrollmentProgress {
  stage: "IDLE" | "PLACE_FINGER" | "LIFT_FINGER" | "PROCESSING" | "COMPLETED";
  scan: number;
  message: string;
}

export async function getEnrollmentProgress(
  employeeId: string,
): Promise<EnrollmentProgress> {
  const endpoint = process.env.NEXT_PUBLIC_BIOMETRIC_GATEWAY_URL;
  if (!endpoint) throw new Error("The biometric gateway is not configured");
  const response = await fetch(
    `${endpoint}/v1/fingerprints/progress?employeeId=${encodeURIComponent(employeeId)}`,
    { cache: "no-store" },
  );
  if (!response.ok) throw new Error("Unable to read fingerprint progress");
  return response.json() as Promise<EnrollmentProgress>;
}

export async function ensureBiometricGatewayReady(): Promise<void> {
  const endpoint = process.env.NEXT_PUBLIC_BIOMETRIC_GATEWAY_URL;
  if (!endpoint) throw new Error("The biometric gateway is not configured");
  try {
    const response = await fetch(`${endpoint}/health`);
    if (!response.ok) throw new Error("Scanner unavailable");
    const health = (await response.json()) as {
      status?: string;
      deviceCount?: number;
    };
    if (health.status !== "ready" || !health.deviceCount)
      throw new Error("The ZKTeco scanner is not connected");
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "The ZKTeco scanner is not connected"
    )
      throw error;
    throw new Error(
      "The fingerprint gateway could not be reached. Keep this page open on the scanner computer and restart the local gateway.",
    );
  }
}

/**
 * Production implementations call a locally installed HTTPS device agent.
 * Fingerprint images and templates must remain on the device/vendor server;
 * the SaaS receives only an opaque template reference and match result.
 */
export async function captureFingerprint(
  request: CaptureRequest,
): Promise<CaptureResult> {
  const endpoint = process.env.NEXT_PUBLIC_BIOMETRIC_GATEWAY_URL;
  if (!endpoint) throw new Error("The biometric gateway is not configured");
  let response: Response;
  try {
    response = await fetch(`${endpoint}/v1/fingerprints/capture`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
    });
  } catch {
    throw new Error(
      "The fingerprint gateway could not be reached. Open Brunovia on this scanner computer and make sure the local ZKTeco gateway is running.",
    );
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(
      payload?.error ?? "Biometric device did not complete the capture",
    );
  }
  return response.json() as Promise<CaptureResult>;
}
