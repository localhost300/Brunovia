$ErrorActionPreference = "Stop"

$taskName = "Brunovia Fingerprint Gateway"
$gatewayScript = Join-Path $PSScriptRoot "run-gateway.ps1"
$sdkPath = Join-Path $PSScriptRoot "bin\libzkfpcsharp.dll"
$assemblyPath = Join-Path $PSScriptRoot "bin\Brunovia.ZKTecoGateway.exe"

if (-not (Test-Path $gatewayScript)) {
    throw "Gateway launcher not found: $gatewayScript"
}
if (-not (Test-Path $sdkPath)) {
    throw "ZKFinger SDK not found: $sdkPath"
}
if (-not (Test-Path $assemblyPath)) {
    throw "Gateway executable not found: $assemblyPath"
}

$powershell = Join-Path $PSHOME "powershell.exe"
$action = New-ScheduledTaskAction `
    -Execute $powershell `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$gatewayScript`""
$trigger = New-ScheduledTaskTrigger -AtLogOn -User ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name)
$principal = New-ScheduledTaskPrincipal `
    -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) `
    -LogonType Interactive `
    -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -MultipleInstances IgnoreNew

Register-ScheduledTask `
    -TaskName $taskName `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Description "Starts Brunovia's local fingerprint gateway when this Windows user signs in." `
    -Force | Out-Null

Write-Host "Installed '$taskName'. It will start automatically the next time you sign in."
