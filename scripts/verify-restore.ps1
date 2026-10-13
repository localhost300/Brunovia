param([Parameter(Mandatory=$true)][string]$SchemaFile,[Parameter(Mandatory=$true)][string]$DataFile)
$ErrorActionPreference="Stop";$schema=(Resolve-Path -LiteralPath $SchemaFile).Path;$data=(Resolve-Path -LiteralPath $DataFile).Path;$container="peopleflow-restore-$([guid]::NewGuid().ToString('N').Substring(0,8))"
try{
 docker run --name $container -e POSTGRES_PASSWORD=restore_check -e POSTGRES_DB=peopleflow_restore -d postgres:17-alpine|Out-Null
 for($i=0;$i-lt 30;$i++){docker exec $container pg_isready -U postgres -d peopleflow_restore 2>$null;if($LASTEXITCODE-eq 0){break};Start-Sleep -Seconds 1}
 docker cp $schema "${container}:/tmp/schema.sql";docker cp $data "${container}:/tmp/data.sql"
 docker exec $container psql -v ON_ERROR_STOP=1 -U postgres -d peopleflow_restore -f /tmp/schema.sql
 if($LASTEXITCODE-ne 0){throw "Schema restore failed"};docker exec $container psql -v ON_ERROR_STOP=1 -U postgres -d peopleflow_restore -f /tmp/data.sql
 if($LASTEXITCODE-ne 0){throw "Data restore failed"};docker exec $container psql -v ON_ERROR_STOP=1 -U postgres -d peopleflow_restore -c "select count(*) as tables from information_schema.tables where table_schema='public';"
 Write-Host "Disposable restore verification passed"
}finally{docker rm -f $container 2>$null|Out-Null}
