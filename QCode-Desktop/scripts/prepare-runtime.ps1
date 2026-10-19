$ErrorActionPreference = "Stop"

$webRoot = Split-Path -Parent $PSScriptRoot
$runtimeRoot = Join-Path $webRoot "runtime"

. (Join-Path $PSScriptRoot "java-toolchain.ps1")
$jdkHome = Resolve-QCodeJdk21 -RequireJlink
$jlink = Join-Path $jdkHome "bin\jlink.exe"
$jmods = Join-Path $jdkHome "jmods"

$resolvedWebRoot = [IO.Path]::GetFullPath($webRoot).TrimEnd([IO.Path]::DirectorySeparatorChar)
$resolvedRuntimeRoot = [IO.Path]::GetFullPath($runtimeRoot)
$expectedPrefix = "$resolvedWebRoot$([IO.Path]::DirectorySeparatorChar)"
if (-not $resolvedRuntimeRoot.StartsWith($expectedPrefix, [StringComparison]::OrdinalIgnoreCase) -or
    [IO.Path]::GetFileName($resolvedRuntimeRoot) -ne "runtime") {
  throw "Refusing to replace unexpected runtime path: $resolvedRuntimeRoot"
}

if (Test-Path -LiteralPath $resolvedRuntimeRoot) {
  Remove-Item -LiteralPath $resolvedRuntimeRoot -Recurse -Force
}

$modules = @(
  "java.se",
  "jdk.charsets",
  "jdk.crypto.ec",
  "jdk.localedata",
  "jdk.management",
  "jdk.security.auth",
  "jdk.unsupported",
  "jdk.zipfs"
) -join ","

$jlinkArgs = @(
  "--module-path", $jmods,
  "--add-modules", $modules,
  "--output", $resolvedRuntimeRoot,
  "--strip-debug",
  "--no-header-files",
  "--no-man-pages",
  "--compress=2"
)
& $jlink @jlinkArgs

if ($LASTEXITCODE -ne 0) {
  throw "jlink failed with exit code $LASTEXITCODE."
}

$bundledJava = Join-Path $resolvedRuntimeRoot "bin\java.exe"
if (-not (Test-Path -LiteralPath $bundledJava)) {
  throw "Bundled Java executable was not created: $bundledJava"
}

Write-Host "Bundled Java runtime prepared: $resolvedRuntimeRoot"
& $bundledJava -version
