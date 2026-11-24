param([string]$Artifact = (Join-Path $PSScriptRoot '../../dist/Image-Files-to-PDF.cjs'))
$ErrorActionPreference = 'Stop'
$Artifact = (Resolve-Path -LiteralPath $Artifact).Path
$work = [IO.Directory]::CreateTempSubdirectory('iftp-powershell-')
Push-Location -LiteralPath $work.FullName
try {
    $utf8 = [Text.UTF8Encoding]::new($false, $true)
    $name = "-photo $([char]0xe9).png"
    $settings = "settings $([char]0x101).json"
    [IO.File]::WriteAllText((Join-Path $work.FullName $settings), '{"mode":"combined","paperSize":"A4","orientation":"Portrait","resolutionLimit":300,"quality":82,"background":"#FFFFFF"}', $utf8)
    & vips black (Join-Path $work.FullName $name) 64 48
    if ($LASTEXITCODE -ne 0) { throw 'The native image fixture failed.' }
    $before = (Get-FileHash -LiteralPath $name).Hash
    & node $Artifact --settings $settings -- $name > receipt.json
    if ($LASTEXITCODE -ne 0) { throw "Unexpected conversion exit: $LASTEXITCODE" }
    $text = $utf8.GetString([IO.File]::ReadAllBytes((Join-Path $work.FullName 'receipt.json')))
    if (-not $text.EndsWith("`n") -or $text.Split("`n").Length -ne 2) { throw 'Expected one UTF-8 receipt line.' }
    $receipt = $text | ConvertFrom-Json
    $doc = $receipt.documents[0]
    if ($receipt.state -ne 'complete' -or [IO.Path]::GetFileName($doc.sources[0]) -cne $name -or
        -not [IO.File]::Exists($doc.output) -or $before -ne (Get-FileHash -LiteralPath $name).Hash) {
        throw 'PowerShell changed an operand, a receipt path, or the source.'
    }
    & node $Artifact --settings $settings $name > bad.json
    if ($LASTEXITCODE -ne 2) { throw 'PowerShell did not preserve the usage exit status.' }
    if ((Get-Content -LiteralPath 'bad.json' -Raw -Encoding utf8 | ConvertFrom-Json).state -ne 'invalid') { throw 'Invalid receipt was lost.' }
    $global:LASTEXITCODE = 0
    Write-Output "PowerShell $($PSVersionTable.PSVersion): literal separator, dash-leading Unicode source, UTF-8 redirection and exit status passed."
}
finally {
    Pop-Location
    $work.Delete($true)
}
