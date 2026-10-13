$ErrorActionPreference = "Stop"
$sdkPath = Join-Path $PSScriptRoot "bin\libzkfpcsharp.dll"
[void][Reflection.Assembly]::LoadFrom($sdkPath)
$assemblyPath = Join-Path $PSScriptRoot "bin\Brunovia.ZKTecoGateway.exe"
$assembly = [Reflection.Assembly]::Load([IO.File]::ReadAllBytes($assemblyPath))
$assembly.EntryPoint.Invoke($null, $null)
