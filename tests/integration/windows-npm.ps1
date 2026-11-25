param([Parameter(Mandatory)][string]$Tarball)
# The npm route on Windows: install the packed tarball globally into a private
# prefix, run npm's launchers, and uninstall. Records how Windows PowerShell
# execution policies treat npm's .ps1 launcher instead of assuming it.
$ErrorActionPreference = 'Stop'
$Tarball = (Resolve-Path -LiteralPath $Tarball).Path
if ($Tarball -notmatch 'image-files-to-pdf-(?<version>\d+\.\d+\.\d+(?:-[\w.]+)?)\.tgz$') { throw 'Pass the packed npm tarball.' }
$version = $Matches.version
$utf8 = [Text.UTF8Encoding]::new($false, $true)
$work = [IO.Directory]::CreateTempSubdirectory('iftp-npm-route-').FullName
$prefix = Join-Path $work 'prefix'
$env:npm_config_audit = 'false'
$env:npm_config_fund = 'false'
$env:npm_config_update_notifier = 'false'
try {
    & npm install --global --prefix $prefix $Tarball
    if ($LASTEXITCODE -ne 0) { throw 'npm install failed.' }
    $cmd = Join-Path $prefix 'image-files-to-pdf.cmd'
    $ps1 = Join-Path $prefix 'image-files-to-pdf.ps1'
    foreach ($shim in $cmd, $ps1) { if (-not [IO.File]::Exists($shim)) { throw "npm did not create $shim." } }

    $reported = (& $cmd --version | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $reported -ne "Image Files to PDF $version") { throw "The .cmd launcher reported '$reported'." }
    $help = & $cmd -h | Out-String
    if ($help -notmatch '(?m)^  image-files-to-pdf --settings <settings\.json> \[--\] <path') { throw 'Help does not name the npm command.' }

    $windowsPowerShell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    foreach ($policy in 'Restricted', 'RemoteSigned', 'Bypass') {
        $output = & $windowsPowerShell -NoProfile -ExecutionPolicy $policy -Command "& '$ps1' --version" 2>&1 | Out-String
        $outcome = if ($LASTEXITCODE -eq 0 -and $output.Trim() -eq "Image Files to PDF $version") { 'runs' } else { "refused: $($output.Trim().Split([Environment]::NewLine)[0])" }
        Write-Output "Windows PowerShell 5.1, execution policy ${policy}: the .ps1 launcher $outcome"
        if ($policy -ne 'Restricted' -and $outcome -ne 'runs') { throw "The .ps1 launcher failed under $policy." }
    }

    $photo = Join-Path $work 'photo.png'
    & vips black $photo 64 48 --bands 3
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the fixture.' }
    $settings = Join-Path $work 'settings.json'
    [IO.File]::WriteAllText($settings, '{"mode":"separate","paperSize":"A4","orientation":"Portrait","resolutionLimit":300,"quality":82,"background":"#FFFFFF"}', $utf8)
    $receiptFile = Join-Path $work 'receipt.json'
    & $cmd --settings $settings -- $photo > $receiptFile
    if ($LASTEXITCODE -ne 0) { throw "Conversion through the .cmd launcher exited $LASTEXITCODE." }
    $receipt = $utf8.GetString([IO.File]::ReadAllBytes($receiptFile)) | ConvertFrom-Json
    if ($receipt.state -ne 'complete' -or -not [IO.File]::Exists($receipt.documents[0].output)) { throw 'The conversion receipt is not complete.' }
    & pdfcpu validate --mode=strict $receipt.documents[0].output
    if ($LASTEXITCODE -ne 0) { throw 'The PDF failed strict validation.' }

    # Only Node's directory and the system directory stay on PATH.
    $nodeDirectory = Split-Path -Parent (& node --print process.execPath)
    $savedPath = $env:PATH
    try {
        $env:PATH = "$nodeDirectory;$env:SystemRoot\System32"
        $refusalFile = Join-Path $work 'refusal.json'
        & $cmd --settings $settings -- $photo > $refusalFile
        $status = $LASTEXITCODE
    } finally { $env:PATH = $savedPath }
    if ($status -ne 3) { throw "Missing tools exited $status, not 3." }
    $refusal = $utf8.GetString([IO.File]::ReadAllBytes($refusalFile)) | ConvertFrom-Json
    $codes = @($refusal.issues | ForEach-Object { $_.code }) -join ','
    if ($codes -ne 'tool-missing,tool-missing,tool-missing,install-hint') { throw "Unexpected setup issues: $codes" }

    & npm uninstall --global --prefix $prefix image-files-to-pdf
    if ($LASTEXITCODE -ne 0) { throw 'npm uninstall failed.' }
    foreach ($shim in $cmd, $ps1) { if ([IO.File]::Exists($shim)) { throw "Uninstall left $shim." } }
    Write-Output "npm route passed on Windows $env:PROCESSOR_ARCHITECTURE`: install, launchers, conversion, missing tools and uninstall for $version."
}
finally {
    [IO.Directory]::Delete($work, $true)
}
