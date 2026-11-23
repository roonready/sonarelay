$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$managerType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime]
$mediaType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties,Windows.Media.Control,ContentType=WindowsRuntime]
$imageType = [Windows.Storage.Streams.IRandomAccessStreamWithContentType,Windows.Storage.Streams,ContentType=WindowsRuntime]
$asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Length -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq ('IAsyncOperation' + [char]96 + '1')
}
$asStream = [System.IO.WindowsRuntimeStreamExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsStream' -and $_.GetParameters().Length -eq 1
}
function Receive-WinRT($Operation, [type]$ResultType) {
    $task = $asTask.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
    if (!$task.Wait(3000)) { $Operation.Cancel(); throw 'GSMTC request timed out.' }
    $task.GetAwaiter().GetResult()
}
function Read-Artwork($Thumbnail) {
    if ($null -eq $Thumbnail) { return }
    $image = Receive-WinRT ($Thumbnail.OpenReadAsync()) $imageType
    if ($null -eq $image) { return }
    $stream = $asStream.Invoke($null, @($image))
    try {
        if ($stream.Length -lt 4 -or $stream.Length -gt 4194304) { return }
        $memory = [IO.MemoryStream]::new()
        try {
            $stream.CopyTo($memory)
            $bytes = $memory.ToArray()
            $head = [BitConverter]::ToString($bytes, 0, 4)
            if ($head -eq '89-50-4E-47') { $mime = 'image/png' }
            elseif ($head -like 'FF-D8-FF-*') { $mime = 'image/jpeg' }
            elseif ($head -eq '47-49-46-38') { $mime = 'image/gif' }
            elseif ($head -eq '52-49-46-46' -and $bytes.Length -ge 12 -and
                [Text.Encoding]::ASCII.GetString($bytes, 8, 4) -eq 'WEBP') { $mime = 'image/webp' }
            else { return }
            'data:' + $mime + ';base64,' + [Convert]::ToBase64String($bytes)
        } finally { $memory.Dispose() }
    } finally { $stream.Dispose() }
}
try {
    $stdin = [Console]::OpenStandardInput()
    $stop = $stdin.ReadAsync([byte[]]::new(1), 0, 1)
    $manager = Receive-WinRT ($managerType::RequestAsync()) $managerType
    while (!$stop.IsCompleted) {
        $current = $manager.GetCurrentSession()
        $selected = $null
        $playing = $false
        foreach ($item in $manager.GetSessions()) {
            $playbackInfo = $item.GetPlaybackInfo()
            $isPlaying = $playbackInfo.PlaybackStatus.ToString() -eq 'Playing'
            if ($null -eq $selected -or ($isPlaying -and !$playing) -or
                ($isPlaying -eq $playing -and [object]::ReferenceEquals($item, $current))) {
                $selected = $item
                $playing = $isPlaying
                $rate = $playbackInfo.PlaybackRate
            }
        }
        $result = $null
        if ($null -ne $selected) {
            if ($null -eq $rate -or $rate -le 0 -or [double]::IsNaN($rate) -or [double]::IsInfinity($rate)) { $rate = 1 }
            try {
                $media = Receive-WinRT ($selected.TryGetMediaPropertiesAsync()) $mediaType
                $art = $null
                try { $art = Read-Artwork $media.Thumbnail } catch {}
                $timeline = $selected.GetTimelineProperties()
                $position = $null
                $duration = $null
                if ($null -ne $timeline) {
                    $position = [Math]::Max(0, ($timeline.Position - $timeline.StartTime).TotalSeconds)
                    $length = ($timeline.EndTime - $timeline.StartTime).TotalSeconds
                    if ($length -gt 0) { $duration = $length }
                    # GSMTC reports an anchor, which may stay unchanged throughout playback.
                    $anchor = $timeline.LastUpdatedTime
                    if ($playing -and $anchor -gt [DateTimeOffset]::MinValue) {
                        $elapsed = ([DateTimeOffset]::UtcNow - $anchor).TotalSeconds
                        if ($elapsed -ge 0) { $position += $elapsed * $rate }
                    }
                    if ($null -ne $duration) { $position = [Math]::Min($position, $duration) }
                }
                $result = @{sourceId=$selected.SourceAppUserModelId; artist=[string]$media.Artist;
                    title=[string]$media.Title; album=[string]$media.AlbumTitle; playing=$playing;
                    position=$position; duration=$duration; rate=$rate; artwork=$art}
                if (-not [string]::IsNullOrWhiteSpace($media.AlbumArtist)) { $result.albumArtist = [string]$media.AlbumArtist }
                if ($media.TrackNumber -gt 0) { $result.trackNumber = [long]$media.TrackNumber }
            } catch {
                $result = @{sourceId=$selected.SourceAppUserModelId; artist=''; title=''; album='';
                    playing=$playing; position=$null; duration=$null; rate=$rate; artwork=$null}
            }
        }
        [Console]::WriteLine((ConvertTo-Json -InputObject $result -Compress))
        Start-Sleep -Milliseconds 1000
    }
} catch {
    [Console]::Error.WriteLine($_.Exception.GetBaseException().Message.Trim())
    exit 1
} finally {
    if ($null -ne $stdin) { $stdin.Dispose() }
}
