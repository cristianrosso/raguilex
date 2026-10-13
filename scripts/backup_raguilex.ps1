param(
  [string]$Container = "raguilex-postgres",
  [string]$Database = "raguilex_inventory",
  [string]$User = "raguilex",
  [string]$UploadDir = "apps\api\uploads",
  [string]$OutputRoot = "backups"
)

$ErrorActionPreference = "Stop"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = Join-Path $OutputRoot "raguilex-$stamp"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

$dbPath = Join-Path $backupDir "database.sql"
docker exec $Container pg_dump -U $User -d $Database | Out-File -LiteralPath $dbPath -Encoding utf8

if (Test-Path -LiteralPath $UploadDir) {
  Copy-Item -LiteralPath $UploadDir -Destination (Join-Path $backupDir "uploads") -Recurse -Force
}

$manifest = [pscustomobject]@{
  createdAt = (Get-Date).ToString("o")
  database = $Database
  container = $Container
  databaseDump = "database.sql"
  uploadsIncluded = (Test-Path -LiteralPath (Join-Path $backupDir "uploads"))
}
$manifest | ConvertTo-Json -Depth 4 | Out-File -LiteralPath (Join-Path $backupDir "manifest.json") -Encoding utf8

Write-Output $backupDir
