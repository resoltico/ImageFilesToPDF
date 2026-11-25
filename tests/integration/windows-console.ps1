param(
    [string]$Artifact = (Join-Path $PSScriptRoot '../../dist/Image-Files-to-PDF.cjs'),
    [ValidateSet('Stop','Crash','Change','Shim')][string]$Scenario = 'Stop',
    # For Shim: npm's .cmd launcher, which runs Node under cmd.exe.
    [string]$Command = ''
)
$ErrorActionPreference = 'Stop'
$Artifact = (Resolve-Path -LiteralPath $Artifact).Path
$work = [IO.Directory]::CreateTempSubdirectory('iftp-console-').FullName
$env:IFTP_CONSOLE_FIXTURE = $work
$env:IFTP_CONSOLE_ARTIFACT = $Artifact
$env:IFTP_CONSOLE_SCENARIO = $Scenario
if ($Scenario -eq 'Shim') {
    if (-not $Command) { throw 'The Shim scenario needs -Command.' }
    $env:IFTP_CONSOLE_COMMAND = (Resolve-Path -LiteralPath $Command).Path
}
$env:IFTP_CONSOLE_NODE = (& node --print process.execPath).Trim()
$env:IFTP_CONSOLE_VIPS = (Get-Command vips -CommandType Application -TotalCount 1).Source
$toolName = if ($Scenario -eq 'Change') { 'vipsheader' } else { 'vips' }
$env:IFTP_CONSOLE_TOOL = (Get-Command $toolName -CommandType Application -TotalCount 1).Source
$utf8 = [Text.UTF8Encoding]::new($false, $true)

$decoder = @'
using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Threading;
using Microsoft.Win32.SafeHandles;

public class DecoderProbe
{
    [DllImport("kernel32.dll")]
    private static extern IntPtr GetStdHandle(int which);

    public static int Main(string[] argv)
    {
        string folder = Environment.GetEnvironmentVariable("IFTP_CONSOLE_FIXTURE");
        bool change = Environment.GetEnvironmentVariable("IFTP_CONSOLE_SCENARIO") == "Change";
        string operation = change ? "-a" : "thumbnail";
        string watched = change ? "/photo.png" : "/input-0";
        if (argv.Length > 1 && argv[0] == operation && argv[1].Replace('\\', '/').Contains(watched))
        {
            File.WriteAllText(Path.Combine(folder, "started"), Process.GetCurrentProcess().Id.ToString());
            for (int attempt = 0; !File.Exists(Path.Combine(folder, "release")); attempt++)
            {
                if (attempt >= 1200) return 124;
                Thread.Sleep(25);
            }
            File.WriteAllText(Path.Combine(folder, "settled"), "yes");
        }
        using (var child = Process.Start(new ProcessStartInfo {
            FileName = Environment.GetEnvironmentVariable("IFTP_CONSOLE_TOOL"),
            Arguments = String.Join(" ", argv.Select(arg => "\"" + arg + "\"")),
            UseShellExecute = false,
            RedirectStandardOutput = change
        }))
        {
            if (change)
            {
                using (var stdout = new FileStream(new SafeFileHandle(GetStdHandle(-11), false), FileAccess.Write))
                    child.StandardOutput.BaseStream.CopyTo(stdout);
            }
            child.WaitForExit();
            return child.ExitCode;
        }
    }
}
'@
$launcher = @'
$ErrorActionPreference = 'Stop'
try {
    Set-Location -LiteralPath $env:IFTP_CONSOLE_FIXTURE
    [IO.File]::WriteAllText((Join-Path $env:IFTP_CONSOLE_FIXTURE 'launched'), 'yes')
    $override = Join-Path $env:IFTP_CONSOLE_FIXTURE 'decoder.exe'
    if ($env:IFTP_CONSOLE_SCENARIO -eq 'Change') { $env:IMAGE_FILES_TO_PDF_VIPSHEADER = $override }
    else { $env:IMAGE_FILES_TO_PDF_VIPS = $override }
    if ($env:IFTP_CONSOLE_COMMAND) {
        $process = Start-Process -FilePath $env:IFTP_CONSOLE_COMMAND -ArgumentList '--settings settings.json -- photo.png' -NoNewWindow -PassThru `
            -WorkingDirectory $env:IFTP_CONSOLE_FIXTURE -RedirectStandardOutput receipt.json -RedirectStandardError stderr.txt
    } else {
        $arguments = '"{0}" --settings settings.json -- photo.png' -f $env:IFTP_CONSOLE_ARTIFACT
        $process = Start-Process -FilePath $env:IFTP_CONSOLE_NODE -ArgumentList $arguments -NoNewWindow -PassThru `
            -WorkingDirectory $env:IFTP_CONSOLE_FIXTURE -RedirectStandardOutput receipt.json -RedirectStandardError stderr.txt
    }
    [IO.File]::WriteAllText((Join-Path $env:IFTP_CONSOLE_FIXTURE 'node-pid'), [string]$process.Id)
    $process.WaitForExit()
} catch {
    [IO.File]::WriteAllText((Join-Path $env:IFTP_CONSOLE_FIXTURE 'launcher-error.txt'), $_.ToString() + [Environment]::NewLine + $_.ScriptStackTrace)
    exit 1
}
'@
$control = @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Threading;

public static class ConsoleStopProbe
{
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool FreeConsole();
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AttachConsole(uint processId);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetConsoleCtrlHandler(IntPtr handler, bool add);
    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GenerateConsoleCtrlEvent(uint controlEvent, uint group);

    public static void Send(uint target)
    {
        FreeConsole();
        if (!AttachConsole(target)) throw new Win32Exception();
        try
        {
            if (!SetConsoleCtrlHandler(IntPtr.Zero, true)) throw new Win32Exception();
            if (!GenerateConsoleCtrlEvent(0, 0)) throw new Win32Exception();
            Thread.Sleep(250);
        }
        finally { FreeConsole(); }
    }
}
'@

function Wait-File([string]$File, [int]$Seconds = 30) {
    for ($attempt = 0; $attempt -lt ($Seconds * 10); $attempt++) {
        if ([IO.File]::Exists($File) -and ([IO.FileInfo]::new($File)).Length -gt 0) { return }
        Start-Sleep -Milliseconds 100
    }
    throw "Timed out waiting for $File."
}

function Test-InterruptedWriter($Node, $Writer, $Helper) {
    $root = Join-Path $env:LOCALAPPDATA 'Image Files to PDF/Workspaces'
    $owned = Get-ChildItem -LiteralPath $root -Filter 'run-*' -Directory | Where-Object {
        try { (Get-Content -LiteralPath (Join-Path $_.FullName 'owner.json') -Raw | ConvertFrom-Json).pid -eq $Node.Id }
        catch { $false }
    } | Select-Object -First 1
    if (-not $owned) { throw 'No workspace owned by the test CLI was found.' }
    $guard = Join-Path $owned.FullName 'command-in-flight'
    if (-not [IO.File]::Exists($guard)) { throw 'The writer started before its ownership guard.' }
    $Node.Kill()
    if (-not $Node.WaitForExit(10000) -or $Writer.HasExited) { throw 'The test did not leave a surviving native writer.' }
    if (-not $Helper.WaitForExit(10000)) { throw 'The PowerShell helper survived the crashed engine.' }
    $settings = Join-Path $work 'settings.json'
    $source = Join-Path $work 'photo.png'
    $result = & node $Artifact --settings $settings -- $source
    if ($LASTEXITCODE -ne 0) { throw 'The restarted CLI failed.' }
    $receipt = $result | ConvertFrom-Json
    $reported = $receipt.diagnostics | Where-Object {
        $_.code -eq 'workspace-retained' -and $_.diagnostic.path -eq $owned.FullName
    }
    if (-not $reported -or -not [IO.File]::Exists($guard)) { throw 'Startup failed to preserve the live writer workspace.' }
    [IO.File]::WriteAllText((Join-Path $work 'release'), 'yes', $utf8)
    if (-not $Writer.WaitForExit(10000)) { throw 'The fixture writer did not settle.' }
    if (-not [IO.File]::Exists($guard)) { throw 'An unacknowledged writer lost its guard.' }
    $owned.Delete($true)
    Write-Output 'Windows forced termination left a live decoder. Restart retained its workspace and produced a verified receipt.'
}

function Test-ConsoleStop($Node, $Writer, $Helper) {
    [ConsoleStopProbe]::Send([uint32]$Node.Id)
    if ($Writer.HasExited) { throw 'Ctrl+C reached the detached decoder.' }
    if ($Helper.HasExited) { throw 'Ctrl+C reached the platform helper before the checkpoint.' }
    [IO.File]::WriteAllText((Join-Path $work 'release'), 'yes', $utf8)
    Wait-File (Join-Path $work 'settled')
    if (-not $Node.WaitForExit(30000)) { throw 'Node did not settle after console Ctrl+C.' }
    Wait-File (Join-Path $work 'receipt.json')
    $receipt = $utf8.GetString([IO.File]::ReadAllBytes((Join-Path $work 'receipt.json'))) | ConvertFrom-Json
    if ($receipt.state -ne 'canceled' -or [IO.File]::Exists((Join-Path $work 'photo.pdf'))) {
        throw 'The console Stop did not produce a canceled receipt without publication.'
    }
    if ($Node.ExitCode -ne 1) { throw 'The console Stop exit status was not 1.' }
    if (-not $Helper.WaitForExit(10000)) { throw 'The PowerShell helper survived Stop.' }
    Write-Output 'Windows PowerShell console Ctrl+C stopped at the next checkpoint and left the decoder running until settlement.'
}

function Test-SourceReplacement($Node) {
    $source = Join-Path $work 'photo.png'
    $newSource = Join-Path $work 'new.png'
    & $env:IFTP_CONSOLE_VIPS black $newSource 32 32
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the replacement fixture.' }
    $hash = (Get-FileHash -LiteralPath $newSource).Hash
    [IO.File]::Move($newSource, $source, $true)
    [IO.File]::WriteAllText((Join-Path $work 'release'), 'yes', $utf8)
    if (-not $Node.WaitForExit(30000)) { throw 'The source replacement test timed out.' }
    Wait-File (Join-Path $work 'receipt.json')
    $receipt = Get-Content -LiteralPath (Join-Path $work 'receipt.json') -Raw -Encoding utf8 | ConvertFrom-Json
    $issue = $receipt.documents[0].issues | Where-Object { $_.stage -eq 'capture' -and $_.message -match 'source changed' }
    if ($Node.ExitCode -ne 1 -or -not $issue -or (Get-FileHash -LiteralPath $source).Hash -ne $hash -or
        [IO.File]::Exists((Join-Path $work 'photo.pdf'))) { throw 'The CLI failed to detect the NTFS source replacement safely.' }
    Write-Output 'NTFS replacement between inspection and capture was refused. The replacement bytes were preserved.'
}

$console = $null
$cmdShell = $null
$runtime = $null
$writer = $null
$helper = $null
try {
    [IO.File]::WriteAllText((Join-Path $work 'decoder.cs'), $decoder, $utf8)
    [IO.File]::WriteAllText((Join-Path $work 'settings.json'), '{"mode":"combined","paperSize":"A4","orientation":"Portrait","resolutionLimit":300,"quality":82,"background":"#FFFFFF"}', $utf8)
    & $env:IFTP_CONSOLE_VIPS black (Join-Path $work 'photo.png') 1600 1000
    if ($LASTEXITCODE -ne 0) { throw 'Could not create the native fixture.' }
    $compiler = Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'
    & $compiler /nologo /target:exe "/out:$work\decoder.exe" "$work\decoder.cs"
    if ($LASTEXITCODE -ne 0) { throw 'Could not compile the native decoder fixture.' }
    Add-Type -TypeDefinition $control
    $shell = (Get-Process -Id $PID).Path
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($launcher))
    $console = Start-Process -FilePath $shell -ArgumentList '-NoLogo', '-NoProfile', '-EncodedCommand', $encoded -WorkingDirectory $work -PassThru
    Wait-File (Join-Path $work 'launched')
    Wait-File (Join-Path $work 'started')
    Wait-File (Join-Path $work 'node-pid')
    $writerId = [int][IO.File]::ReadAllText((Join-Path $work 'started'))
    $nodeId = [int][IO.File]::ReadAllText((Join-Path $work 'node-pid'))
    if ($Scenario -eq 'Shim') {
        # The launched process is cmd.exe running npm's .cmd; Node is its child.
        $cmdShell = Get-Process -Id $nodeId
        $null = $cmdShell.Handle
        $children = @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$nodeId AND Name='node.exe'")
        if ($children.Count -ne 1) { throw 'Expected exactly one Node process under the npm launcher.' }
        $nodeId = [int]$children[0].ProcessId
    }
    $writer = Get-Process -Id $writerId
    $runtime = Get-Process -Id $nodeId
    $null = $runtime.Handle
    $null = $writer.Handle
    $helperInfo = @(Get-CimInstance Win32_Process -Filter "ParentProcessId=$nodeId AND Name='powershell.exe'")
    if ($helperInfo.Count -ne 1) { throw 'Expected exactly one live platform helper.' }
    $helper = Get-Process -Id $helperInfo[0].ProcessId
    $null = $helper.Handle
    switch ($Scenario) {
        'Crash' { Test-InterruptedWriter $runtime $writer $helper }
        'Change' { Test-SourceReplacement $runtime }
        'Stop' { Test-ConsoleStop $runtime $writer $helper }
        'Shim' {
            Test-ConsoleStop $runtime $writer $helper
            if ($cmdShell.WaitForExit(3000)) {
                Write-Output "npm .cmd launcher: cmd.exe exited with $($cmdShell.ExitCode) after the console Stop."
            } else {
                Write-Output 'npm .cmd launcher: cmd.exe was still waiting 3 s after Node exited (Terminate batch job prompt); the receipt and exit status above come from Node.'
            }
        }
    }
}
catch {
    foreach ($name in 'launcher-error.txt', 'stderr.txt', 'receipt.json', 'status') {
        $file = Join-Path $work $name
        if ([IO.File]::Exists($file)) { Get-Content -LiteralPath $file -Raw }
    }
    if ($console -and $console.HasExited) { Write-Output "Test console exit: $($console.ExitCode)" }
    throw
}
finally {
    if ($writer -and -not $writer.HasExited) { [IO.File]::WriteAllText((Join-Path $work 'release'), 'yes', $utf8); $null = $writer.WaitForExit(10000) }
    if ($runtime -and -not $runtime.HasExited) { $runtime.Kill(); $runtime.WaitForExit() }
    if ($cmdShell -and -not $cmdShell.HasExited) { $cmdShell.Kill(); $cmdShell.WaitForExit() }
    if ($helper -and -not $helper.HasExited) { $helper.Kill(); $helper.WaitForExit() }
    if ($console -and -not $console.HasExited) { $console.Kill(); $console.WaitForExit() }
    [IO.Directory]::Delete($work, $true)
}
