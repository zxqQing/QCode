function Get-QCodeJavaMajorVersion {
  param([Parameter(Mandatory = $true)][string]$JavaHome)

  $releaseFile = Join-Path $JavaHome "release"
  if (-not (Test-Path -LiteralPath $releaseFile)) {
    return $null
  }

  $match = Select-String -LiteralPath $releaseFile -Pattern '^JAVA_VERSION="(?<version>\d+)' | Select-Object -First 1
  if (-not $match) {
    return $null
  }

  return [int]$match.Matches[0].Groups['version'].Value
}

function Resolve-QCodeJdk21 {
  param([switch]$RequireJlink)

  $candidates = New-Object System.Collections.Generic.List[string]
  if ($env:QCODE_JAVA_HOME) { $candidates.Add($env:QCODE_JAVA_HOME) }

  $javaCommand = Get-Command java.exe -ErrorAction SilentlyContinue
  if ($javaCommand) {
    $candidates.Add((Split-Path -Parent (Split-Path -Parent $javaCommand.Source)))
  }

  if ($env:JAVA_HOME) { $candidates.Add($env:JAVA_HOME) }

  foreach ($candidate in ($candidates | Select-Object -Unique)) {
    $resolved = [IO.Path]::GetFullPath($candidate)
    $javaExe = Join-Path $resolved "bin\java.exe"
    $jlinkExe = Join-Path $resolved "bin\jlink.exe"
    $major = Get-QCodeJavaMajorVersion -JavaHome $resolved
    if ((Test-Path -LiteralPath $javaExe) -and $major -ge 21 -and (-not $RequireJlink -or (Test-Path -LiteralPath $jlinkExe))) {
      return $resolved
    }
  }

  throw "Java 21 JDK not found. Set QCODE_JAVA_HOME to a JDK 21+ directory and retry."
}
