param([Parameter(Mandatory=$true)][string]$DatabaseUrl,[string]$OutputDirectory="artifacts/backups")
$ErrorActionPreference="Stop"
$resolved=[System.IO.Path]::GetFullPath((Join-Path (Get-Location) $OutputDirectory));New-Item -ItemType Directory -Force -Path $resolved|Out-Null
$stamp=Get-Date -Format "yyyyMMdd-HHmmss";$schema=Join-Path $resolved "peopleflow-schema-$stamp.sql";$data=Join-Path $resolved "peopleflow-data-$stamp.sql"
supabase db dump --db-url $DatabaseUrl --file $schema
if($LASTEXITCODE-ne 0){throw "Schema backup failed"}
supabase db dump --db-url $DatabaseUrl --data-only --use-copy --file $data
if($LASTEXITCODE-ne 0){throw "Data backup failed"}
$manifest=@{created_at=(Get-Date).ToUniversalTime().ToString("o");schema=[IO.Path]::GetFileName($schema);data=[IO.Path]::GetFileName($data);schema_sha256=(Get-FileHash $schema -Algorithm SHA256).Hash;data_sha256=(Get-FileHash $data -Algorithm SHA256).Hash}|ConvertTo-Json
$manifest|Set-Content -LiteralPath (Join-Path $resolved "peopleflow-manifest-$stamp.json") -Encoding utf8
Write-Host "Backup created and checksummed in $resolved"
