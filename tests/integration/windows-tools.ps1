$ErrorActionPreference = 'Stop'
$root = Join-Path $env:RUNNER_TEMP 'iftp-native-tools'
New-Item -ItemType Directory -Path $root | Out-Null

function Add-Tool([string]$Url, [string]$Sha256, [string]$Name) {
    $archive = Join-Path $root "$Name.zip"
    $target = Join-Path $root $Name
    Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $archive
    if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $Sha256) {
        throw "Unexpected SHA256 for $Name."
    }
    Expand-Archive -LiteralPath $archive -DestinationPath $target
    $tools = @(Get-ChildItem -LiteralPath $target -Recurse -Filter "$Name.exe" -File)
    if ($tools.Count -ne 1) { throw "Expected exactly one $Name.exe." }
    $tools[0].Directory.FullName | Out-File -FilePath $env:GITHUB_PATH -Encoding utf8 -Append
}
# Native builds per architecture; pdfcpu publishes x86-64 only and runs under
# emulation on ARM64.
switch ($env:PROCESSOR_ARCHITECTURE) {
    'ARM64' {
        Add-Tool 'https://github.com/libvips/build-win64-mxe/releases/download/v8.18.7/vips-dev-arm64-all-8.18.7.zip' '8f2d3a94bbc485a8226cdea012d3a76ac660a373a154fabcd772226978e56f4a' 'vips'
        Add-Tool 'https://github.com/qpdf/qpdf/releases/download/v12.4.2/qpdf-12.4.2-msvc-arm64.zip' '2b5d7740a2513d8a841116692dc2cf7efe83f35262386ebab18bed35fbf15ab1' 'qpdf'
    }
    'AMD64' {
        Add-Tool 'https://github.com/libvips/build-win64-mxe/releases/download/v8.18.7/vips-dev-x64-all-8.18.7.zip' '78e56ba30c267ba32ff965200534bd5721364cadbead8c4d595e44b58dfeff15' 'vips'
        Add-Tool 'https://github.com/qpdf/qpdf/releases/download/v12.4.2/qpdf-12.4.2-msvc64.zip' 'db87077e683630c1217e0e8f9a20a9749d952ab676e881c3689187763a5de25d' 'qpdf'
    }
    default { throw "No pinned tools for $env:PROCESSOR_ARCHITECTURE." }
}
Add-Tool 'https://github.com/pdfcpu/pdfcpu/releases/download/v0.16.4/pdfcpu_0.16.4_Windows_x86_64.zip' 'faf6c51d6f54d96a8c1ad5beee02143460b8ae97bd9630cbab1a253adaa43558' 'pdfcpu'
