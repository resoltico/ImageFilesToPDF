param([string]$Artifact = (Join-Path $PSScriptRoot '../../dist/Image-Files-to-PDF.cjs'))
$ErrorActionPreference = 'Stop'
$Artifact = (Resolve-Path -LiteralPath $Artifact).Path
$work = [IO.Directory]::CreateTempSubdirectory('iftp-recovery-').FullName
$destination = [IO.Directory]::CreateDirectory((Join-Path $work 'destination'))
$name = "iftp-$([guid]::NewGuid().ToString('N'))"
$source = Join-Path $destination.FullName "$name.png"
$settings = Join-Path $work 'settings.json'
$beforeAcl = Get-Acl -LiteralPath $destination.FullName
$recovery = $null
try {
    & vips black $source 64 48
    if ($LASTEXITCODE -ne 0) { throw 'The image fixture could not be created.' }
    $hash = (Get-FileHash -LiteralPath $source).Hash
    [IO.File]::WriteAllText($settings, '{"mode":"combined","paperSize":"A4","orientation":"Portrait","resolutionLimit":300,"quality":82,"background":"#FFFFFF"}')
    $acl = Get-Acl -LiteralPath $destination.FullName
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $rule = [Security.AccessControl.FileSystemAccessRule]::new($sid, 'CreateFiles', 'None', 'None', 'Deny')
    $acl.AddAccessRule($rule)
    Set-Acl -LiteralPath $destination.FullName -AclObject $acl
    $negative = Join-Path $destination.FullName 'claim-negative-control'
    $denied = $false
    try { [IO.File]::WriteAllText($negative, 'This write must be denied.') }
    catch [UnauthorizedAccessException] { $denied = $true }
    if (-not $denied) { throw 'The test directory still allows file creation.' }

    $json = & node $Artifact --settings $settings -- $source
    if ($LASTEXITCODE -ne 1) { throw 'Expected an incomplete run after the denied claim.' }
    $receipt = $json | ConvertFrom-Json
    $document = $receipt.documents[0]
    if ($document.state -ne 'recovered' -or [IO.File]::Exists((Join-Path $destination.FullName "$name.pdf")) -or
        (Get-FileHash -LiteralPath $source).Hash -ne $hash) { throw 'The source, final name, or recovery record is incorrect.' }

    $recovery = $document.recovery
    & qpdf --check $recovery
    if ($LASTEXITCODE -ne 0) { throw 'The recovery PDF failed independent validation.' }
    & pdfcpu validate --conf disable --mode=strict $recovery
    if ($LASTEXITCODE -ne 0) { throw 'The recovery PDF failed strict validation.' }
    Write-Output 'A denied NTFS claim preserved the source and produced a verified recovery PDF.'
}
finally {
    Set-Acl -LiteralPath $destination.FullName -AclObject $beforeAcl
    if ($recovery -and [IO.Path]::GetFileName($recovery) -ceq "$name.pdf") {
        [IO.File]::Delete($recovery)
    }
    [IO.Directory]::Delete($work, $true)
}
