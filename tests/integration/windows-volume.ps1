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
    Format-Volume -Partition $partition -FileSystem NTFS -NewFileSystemLabel 'IFTPQA' -Confirm:$false | Format-Table DriveLetter,FileSystem
    $env:IFTP_CROSS_VOLUME_ONLY = "1"
    $env:IFTP_SECOND_VOLUME = "${letter}:\"
    node (Join-Path $PSScriptRoot 'native-cli.cjs')
    if ($LASTEXITCODE -ne 0) { throw 'Native CLI verification failed.' }
}
finally {
    if ($attached -or (Test-Path -LiteralPath $image)) {
        $info = Get-DiskImage -ImagePath $image -ErrorAction SilentlyContinue
        if ($info.Attached) { Run-DiskPart @("select vdisk file=`"$image`"", "detach vdisk") }
    }
    [IO.Directory]::Delete($work, $true)
}
