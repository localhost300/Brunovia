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

## Start automatically on Windows sign-in

Run this once from PowerShell in the project folder to register a scheduled task
for your current Windows account:

```powershell
powershell -ExecutionPolicy Bypass -File .\device-gateway\zkteco\install-gateway-startup.ps1
```

The task launches the gateway hidden when you sign in. The gateway is stopped
when Windows shuts down, so it will start again at the next sign-in. To remove
automatic startup, run:

```powershell
Unregister-ScheduledTask -TaskName "Brunovia Fingerprint Gateway" -Confirm:$false
```

Configure the web app:

```text
NEXT_PUBLIC_BIOMETRIC_GATEWAY_URL=http://127.0.0.1:8787
```

The gateway permits local development origins and the production origins
`https://brunovia.xyz` and `https://www.brunovia.xyz`. It also answers Chromium's
private-network preflight. Keep the gateway bound to loopback so it is not
reachable from other computers on the network.
