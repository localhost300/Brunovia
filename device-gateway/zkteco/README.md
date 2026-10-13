# Brunovia ZKTeco SLK20R gateway

This loopback-only Windows gateway bridges Brunovia to the official ZKFinger SDK.
It never returns fingerprint images or raw templates to the browser. Enrollment
templates are encrypted locally with Windows DPAPI for the current Windows user.

## Build and run

```powershell
powershell -ExecutionPolicy Bypass -File .\device-gateway\zkteco\build.ps1
.\device-gateway\zkteco\bin\Brunovia.ZKTecoGateway.exe
```

Health check: `http://127.0.0.1:8787/health`

Configure the web app:

```text
NEXT_PUBLIC_BIOMETRIC_GATEWAY_URL=http://127.0.0.1:8787
```

The HTTP loopback endpoint is suitable for local development. A remotely hosted
HTTPS Brunovia deployment requires a trusted local HTTPS certificate or a native
companion bridge to avoid browser mixed-content blocking.
