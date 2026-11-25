$ErrorActionPreference = 'Stop'
$artifact = Join-Path $PSScriptRoot '../../dist/Image-Files-to-PDF.cjs'
$work = New-Item -ItemType Directory -Path (Join-Path $env:RUNNER_TEMP "iftp-cloud-$([guid]::NewGuid())")
$root = New-Item -ItemType Directory -Path (Join-Path $work.FullName 'sync-root')
$provider = $null
$passed = $false
try {
    Add-Type -Path (Join-Path $PSScriptRoot 'CloudFilesFixture.cs')
    $png = Join-Path $work.FullName 'original.png'
    $jpeg = Join-Path $work.FullName 'original.jpg'
    & vips black $png 64 48 --bands 3
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the PNG fixture.' }
    & vips copy $png $jpeg
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the JPEG fixture.' }
    $originals = @($png, $jpeg)
    $names = @('one.png', 'two.jpg')
    $sources = @($names | ForEach-Object { Join-Path $root.FullName $_ })
    $expectedHashes = @($originals | ForEach-Object { (Get-FileHash -LiteralPath $_).Hash })

    $provider = [CloudFilesFixture]::new($root.FullName, $png, $jpeg)
    for ($index = 0; $index -lt $names.Count; $index++) {
        $name = $names[$index]
        $provider.Create($name, $index)
        $onDisk = $provider.BytesOnDisk($name)
        if ($onDisk -ne 0 -or $provider.FetchCount($index) -ne 0) {
            throw "$name was not dehydrated before conversion. On-disk bytes: $onDisk."
        }
        Write-Output "$name began as a Cloud Files placeholder with $onDisk on-disk bytes."
    }

    $settings = Join-Path $work.FullName 'settings.json'
    '{"mode":"combined","paperSize":"A4","orientation":"Portrait","resolutionLimit":300,"quality":82,"background":"#FFFFFF"}' |
        Set-Content -Encoding utf8NoBOM -LiteralPath $settings
    $receiptFile = Join-Path $work.FullName 'receipt.json'
    & node $artifact --settings $settings -- $root.FullName > $receiptFile
    $status = $LASTEXITCODE
    foreach ($index in 0..1) { $null = $provider.FetchCount($index) }
    if ($status -ne 0) { throw "Placeholder folder conversion exited $status. $(Get-Content -Raw -LiteralPath $receiptFile)" }
    $receipt = Get-Content -Raw -LiteralPath $receiptFile | ConvertFrom-Json
    $documents = @($receipt.documents)
    if ($receipt.state -ne 'complete' -or $documents.Count -ne 1 -or $receipt.rejected.Count -ne 0) {
        throw "Unexpected placeholder receipt. $(Get-Content -Raw -LiteralPath $receiptFile)"
    }
    $document = $documents[0]
    if ($document.state -ne 'saved' -or $document.pages -ne 2 -or ($document.sources -join '|') -cne ($sources -join '|')) {
        throw "Unexpected placeholder document. $(Get-Content -Raw -LiteralPath $receiptFile)"
    }
    & pdfcpu validate --conf disable --mode=strict $document.output
    if ($LASTEXITCODE -ne 0) { throw 'Strict placeholder PDF validation failed.' }
    $pages = (& qpdf --show-npages $document.output)
    if ($LASTEXITCODE -ne 0 -or $pages -ne '2') { throw 'Unexpected placeholder PDF page count.' }

    foreach ($index in 0..1) {
        $onDisk = $provider.BytesOnDisk($names[$index])
        $fetches = $provider.FetchCount($index)
        if ($onDisk -le 0 -or $fetches -lt 1) { throw "CLI did not hydrate $($names[$index])." }
        if ((Get-FileHash -LiteralPath $sources[$index]).Hash -ne $expectedHashes[$index] -or
            (Get-FileHash -LiteralPath $originals[$index]).Hash -ne $expectedHashes[$index]) {
            throw "The source bytes of $($names[$index]) changed."
        }
        Write-Output "$($names[$index]) remained a Cloud Files placeholder, hydrated to $onDisk on-disk bytes after $fetches fetches."
    }
    $passed = $true
}
finally {
    try { if ($null -ne $provider) { $provider.Dispose() } }
    finally {
        if ($passed) { Remove-Item -LiteralPath $work.FullName -Recurse -Force }
        else { Write-Output "Cloud Files failure evidence: $($work.FullName)" }
    }
}
