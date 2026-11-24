param(
    [Parameter(Mandatory = $true)][string]$Executable,
    [string]$ProfileDirectory
)
$ErrorActionPreference = 'Stop'
if ($Executable -notmatch '^[a-zA-Z0-9_.-]+\.exe$') { exit 1 }
$sessionId = [Diagnostics.Process]::GetCurrentProcess().SessionId
$processes = @(Get-CimInstance Win32_Process -Filter "Name = '$Executable' AND SessionId = $sessionId")
$ids = @($processes | ForEach-Object ProcessId)
$roots = @($processes | Where-Object { $ids -notcontains $_.ParentProcessId })
if ($ProfileDirectory -and $Executable -in @('chrome.exe', 'msedge.exe')) {
    $lastfmDirectory = if ($Executable -eq 'chrome.exe') { 'chrome-lastfm' } else { 'edge-lastfm' }
    $profilePrefix = [IO.Path]::GetFullPath((Join-Path $ProfileDirectory $lastfmDirectory)) + [IO.Path]::DirectorySeparatorChar
    $roots = @($roots | Where-Object {
        $argument = [regex]::Match([string]$_.CommandLine,
            '(?:^|\s)(?:"--user-data-dir=(?<dir>[^"]+)"|--user-data-dir=(?:"(?<dir>[^"]+)"|(?<dir>[^\s"]+)))(?=\s|$)',
            [Text.RegularExpressions.RegexOptions]::IgnoreCase)
        if (!$argument.Success) { return $true }
        try {
            $directory = [IO.Path]::GetFullPath($argument.Groups['dir'].Value) + [IO.Path]::DirectorySeparatorChar
            return !$directory.StartsWith($profilePrefix, [StringComparison]::OrdinalIgnoreCase)
        } catch { return $true }
    })
}
if ($roots.Count -ne 1) { exit 1 }
[Console]::WriteLine($roots[0].ProcessId)
