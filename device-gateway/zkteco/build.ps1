$ErrorActionPreference = "Stop"
$sdk = "C:\Windows\System32\libzkfpcsharp.dll"
$compiler = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
$output = Join-Path $PSScriptRoot "bin"
if (!(Test-Path $sdk)) { throw "ZKFinger SDK is not installed: $sdk" }
if (!(Test-Path $compiler)) { throw ".NET Framework C# compiler was not found: $compiler" }
New-Item -ItemType Directory -Path $output -Force | Out-Null
& $compiler /nologo /target:exe /platform:x64 /optimize+ /out:"$output\Brunovia.ZKTecoGateway.exe" /reference:System.Web.Extensions.dll /reference:System.Security.dll /reference:"$sdk" "$PSScriptRoot\Program.cs"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Copy-Item -LiteralPath $sdk -Destination "$output\libzkfpcsharp.dll" -Force
Write-Host "Built $output\Brunovia.ZKTecoGateway.exe"
