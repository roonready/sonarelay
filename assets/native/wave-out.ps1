$ErrorActionPreference = 'Stop'
try {
    Add-Type -Path (Join-Path $PSScriptRoot 'WaveOut.cs')
    [SonaRelay.WaveOutPlayer]::Run(48000)
} catch {
    [Console]::Error.WriteLine('waveout:failed')
    exit 1
}
