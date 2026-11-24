$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$work = [IO.Directory]::CreateTempSubdirectory('iftp-probe-').FullName
$sourceId = 'ImageFilesToPdfPowerShellProcessCount'
$previousLocalAppData = $env:LOCALAPPDATA
try {
    $env:LOCALAPPDATA = Join-Path $work 'state'
    [IO.Directory]::CreateDirectory($env:LOCALAPPDATA) | Out-Null
    $tool = (Resolve-Path (Join-Path $PSScriptRoot '../../dist/Image-Files-to-PDF.cjs')).Path
    $fixture = Join-Path $work 'fixture.png'
    & vips black $fixture 64 48 --bands 3
    if ($LASTEXITCODE -ne 0) { throw 'Fixture generation failed.' }
    $album = Join-Path $work 'album'
    [IO.Directory]::CreateDirectory($album) | Out-Null
    foreach ($index in 1..20) { [IO.File]::Copy($fixture, (Join-Path $album "$index.png")) }
    $hidden = Join-Path $album "hidden.png"
    [IO.File]::Copy($fixture, $hidden)
    [IO.File]::SetAttributes($hidden, [IO.FileAttributes]::Hidden)
    $settings = Join-Path $work 'settings.json'
    [IO.File]::WriteAllText($settings,'{"mode":"separate","paperSize":"A4","orientation":"Portrait","resolutionLimit":300,"quality":82,"background":"#FFFFFF"}')
    $receipt = Join-Path $work 'receipt.json'
    $stderr = Join-Path $work 'stderr.txt'
    Register-CimIndicationEvent -Namespace root/cimv2 -Query "SELECT * FROM Win32_ProcessStartTrace WHERE ProcessName='powershell.exe'" -SourceIdentifier $sourceId | Out-Null
    $timer = [Diagnostics.Stopwatch]::StartNew()
    $args = ('"{0}" --settings "{1}" -- "{2}"' -f $tool,$settings,$album)
    $node = Start-Process -FilePath 'node' -ArgumentList $args -PassThru -NoNewWindow -RedirectStandardOutput $receipt -RedirectStandardError $stderr
    if (-not $node.WaitForExit(90000)) { $node.Kill(); throw 'Engine timed out.' }
    $timer.Stop()
    if ($node.ExitCode -ne 0) {
        Get-Content -LiteralPath $stderr
        Get-Content -LiteralPath $receipt
        throw "20-image run failed: $($node.ExitCode)"
    }
    Start-Sleep -Milliseconds 500
    $created = @(Get-Event -SourceIdentifier $sourceId -ErrorAction SilentlyContinue | Where-Object {
        $_.SourceEventArgs.NewEvent.ParentProcessID -eq $node.Id
    })
    $result = Get-Content -LiteralPath $receipt -Raw -Encoding utf8 | ConvertFrom-Json
    Write-Host "20 images: $($result.documents.Count) documents, $($created.Count) PowerShell processes, $([math]::Round($timer.Elapsed.TotalSeconds,2)) seconds"
    if ($result.state -ne 'complete' -or $result.documents.Count -ne 20 -or $created.Count -ne 1) { throw 'Native process-budget contract failed.' }
    $longDir = Join-Path (Join-Path $work ('a' * 130)) ('b' * 130)
    [IO.Directory]::CreateDirectory($longDir) | Out-Null
    $source = Join-Path $longDir 'photo.png'
    [IO.File]::Copy($fixture, ('\\?\' + $source))
    $json = & node $tool --settings $settings -- $source
    if ($LASTEXITCODE -ne 0) { throw "Long-path engine failed: $json" }
    $result = $json | ConvertFrom-Json
    if ($result.state -ne 'complete' -or $result.documents[0].state -ne 'saved') { throw 'Expected one saved long-path PDF.' }
    $pdf = '\\?\' + $result.documents[0].output
    & pdfcpu validate --conf disable --mode=strict $pdf
    if ($LASTEXITCODE -ne 0) { throw 'Long-path PDF failed strict validation.' }
    Write-Host ("Converted and validated an image at a " + $source.Length + "-character path.")
} finally {
    $env:LOCALAPPDATA = $previousLocalAppData
    Unregister-Event -SourceIdentifier $sourceId -ErrorAction SilentlyContinue
    Remove-Event -SourceIdentifier $sourceId -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath ('\\?\' + $work) -Recurse -Force -ErrorAction SilentlyContinue
}
