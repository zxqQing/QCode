$ErrorActionPreference = "Stop"

$webRoot = Split-Path -Parent $PSScriptRoot
$backendRoot = Join-Path $webRoot "..\QCode"
$targetRoot = Join-Path $backendRoot "target"
$bundleRoot = Join-Path $webRoot "backend"

if (-not (Test-Path (Join-Path $backendRoot "pom.xml"))) {
  throw "Backend Maven project not found: $backendRoot"
}

Push-Location $backendRoot
try {
  mvn -DskipTests package
} finally {
  Pop-Location
}

$jar = Get-ChildItem $targetRoot -Filter "*.jar" |
  Where-Object { $_.Name -notmatch "-sources|-javadoc|original" } |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $jar) {
  throw "Maven finished but no Spring Boot jar was found in target."
}

New-Item -ItemType Directory -Force -Path $bundleRoot | Out-Null
Copy-Item $jar.FullName (Join-Path $bundleRoot "qcode.jar") -Force
Write-Host "Backend bundle prepared: $(Join-Path $bundleRoot 'qcode.jar')"
