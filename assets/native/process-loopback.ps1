param([Parameter(Mandatory = $true)][uint32]$ProcessId)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
try {
    Add-Type -Path (Join-Path $PSScriptRoot 'ProcessLoopback.cs')
    [SonaRelay.ProcessLoopback]::Run($ProcessId)
} catch {
    [Console]::Error.WriteLine($_.Exception.GetBaseException().Message)
    exit 1
}
