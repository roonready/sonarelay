$ErrorActionPreference = 'Stop'
try {
    Add-Type -Path (Join-Path $PSScriptRoot 'WindowsVolume.cs')
    while ($null -ne ($line = [Console]::In.ReadLine())) {
        $id = 0
        try {
            $request = $line | ConvertFrom-Json
            $id = [int]$request.id
            $write = $null -ne $request.value
            $result = [SonaRelay.WindowsVolume]::ReadOrSet([double]$request.value, $write)
            [Console]::WriteLine((@{id=$id; volume=$result.Volume; muted=$result.Muted} | ConvertTo-Json -Compress))
        } catch {
            [Console]::WriteLine((@{id=$id; error='volume.windowsUnavailable'} | ConvertTo-Json -Compress))
        }
    }
} catch {
    [Console]::Error.WriteLine('windows-volume:failed')
    exit 1
}
