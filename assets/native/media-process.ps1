param([Parameter(Mandatory = $true)][string]$Executable)
$ErrorActionPreference = 'Stop'
if ($Executable -notmatch '^[a-zA-Z0-9_.-]+\.exe$') { exit 1 }
$sessionId = [Diagnostics.Process]::GetCurrentProcess().SessionId
$processes = @(Get-CimInstance Win32_Process -Filter "Name = '$Executable' AND SessionId = $sessionId")
$ids = @($processes | ForEach-Object ProcessId)
$roots = @($processes | Where-Object { $ids -notcontains $_.ParentProcessId })
if ($roots.Count -ne 1) { exit 1 }
[Console]::WriteLine($roots[0].ProcessId)
