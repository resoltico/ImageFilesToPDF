param([ValidateSet('NTFS', 'FAT32', 'exFAT')][string]$FileSystem = 'NTFS')
$ErrorActionPreference = 'Stop'
$work = [IO.Directory]::CreateTempSubdirectory('iftp-vhd-').FullName
$image = Join-Path $work 'scratch.vhdx'
$scriptFile = Join-Path $work 'diskpart.txt'
$diskpart = Join-Path $env:SystemRoot 'System32/diskpart.exe'
$attached = $false

function Run-DiskPart([string[]]$Lines) {
    [IO.File]::WriteAllLines($scriptFile, $Lines)
    & $diskpart /s $scriptFile
    if ($LASTEXITCODE -ne 0) { throw "DiskPart failed ($LASTEXITCODE)." }
}

try {
    $letter = @('W', 'V', 'U' , 'T') | Where-Object { -not (Get-PSDrive -Name $_ -ErrorAction SilentlyContinue) } | Select-Object -First 1
    if (-not $letter) { throw 'No test drive letter is available.' }
    Run-DiskPart @(
        "create vdisk file=`"$image`" maximum=128 type=expandable",
        "select vdisk file=`"$image`"",
        "attach vdisk"
    )
    $attached = $true
    $disk = Get-DiskImage -ImagePath $image | Get-Disk
    if (-not $disk -or $disk.PartitionStyle -ne 'RAW' -or $disk.Size -gt 134217728 -or $disk.IsBoot -or $disk.IsSystem) {
        throw 'Refusing to format a disk other than the fresh test VHD.'
    }
    Initialize-Disk -Number $disk.Number -PartitionStyle GPT
    $partition = New-Partition -DiskNumber $disk.Number -UseMaximumSize -DriveLetter $letter
    $volume = Format-Volume -Partition $partition -FileSystem $FileSystem -NewFileSystemLabel 'IFTPQA' -Confirm:$false
    if ($volume.FileSystem -ne $FileSystem) { throw "Expected $FileSystem but found $($volume.FileSystem)." }
    $volume | Format-Table DriveLetter,FileSystem
    $env:IFTP_CROSS_VOLUME_ONLY = "1"
    $env:IFTP_SECOND_VOLUME = "${letter}:\"
    $env:IFTP_CARD_VOLUME = if ($FileSystem -ne 'NTFS') { $FileSystem } else { '' }
    node (Join-Path $PSScriptRoot 'native-cli.cjs')
    if ($LASTEXITCODE -ne 0) { throw 'Native CLI verification failed.' }
    if ($FileSystem -ne 'NTFS') {
        node (Join-Path $PSScriptRoot 'windows-claim-probe.cjs') "${letter}:\"
        if ($LASTEXITCODE -ne 0) { throw 'Exclusive move replacement control failed.' }
    }
}
finally {
    Remove-Item Env:IFTP_CROSS_VOLUME_ONLY,Env:IFTP_SECOND_VOLUME,Env:IFTP_CARD_VOLUME -ErrorAction SilentlyContinue
    if ($attached -or (Test-Path -LiteralPath $image)) {
        $info = Get-DiskImage -ImagePath $image -ErrorAction SilentlyContinue
        if ($info.Attached) { Run-DiskPart @("select vdisk file=`"$image`"", "detach vdisk") }
    }
    [IO.Directory]::Delete($work, $true)
}
