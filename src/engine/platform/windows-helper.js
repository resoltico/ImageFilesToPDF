"use strict";
const { Buffer } = require("node:buffer");

const WINDOWS_HELPER = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ImageFilesToPDFNative {
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool SetConsoleCtrlHandler(IntPtr handler, bool add);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, ExactSpelling = true, SetLastError = true)]
    private static extern bool MoveFileExW(string from, string to, uint flags);

    public static void MoveExclusive(string from, string to) {
        // With no flags the move cannot overwrite or fall back to a copy.
        if (!MoveFileExW(from, to, 0)) {
            throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        }
    }
}
'@
if (-not [ImageFilesToPDFNative]::SetConsoleCtrlHandler([IntPtr]::Zero, $true)) {
    throw 'Could not configure helper console handling.'
}
$encoding = [Text.UTF8Encoding]::new($false, $true)
$reader = [IO.StreamReader]::new([Console]::OpenStandardInput(), $encoding)
$writer = [IO.StreamWriter]::new([Console]::OpenStandardOutput(), $encoding)
$writer.AutoFlush = $true

function Read-Downloads {
    $root = 'Software\Microsoft\Windows\CurrentVersion\Explorer'
    $keyName = '{374DE290-123F-4565-9164-39C4925E467B}'
    foreach ($subkey in 'User Shell Folders', 'Shell Folders') {
        $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey("$root\$subkey")
        if ($key) {
            try {
                $value = $key.GetValue($keyName, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
                if ($value -is [string] -and $value) {
                    return [Environment]::ExpandEnvironmentVariables($value)
                }
            } finally { $key.Dispose() }
        }
    }
    return $null
}

function Set-Or-VerifyPrivateDirectory($p, $created) {
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    if ([IO.File]::GetAttributes($p) -band [IO.FileAttributes]::ReparsePoint) { throw 'A directory cannot be a reparse point.' }
    $directory = [IO.DirectoryInfo]::new($p)
    if ($created) {
        $acl = [Security.AccessControl.DirectorySecurity]::new()
        $acl.SetOwner($sid)
        $acl.SetAccessRuleProtection($true, $false)
        $rule = [Security.AccessControl.FileSystemAccessRule]::new($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
        $acl.AddAccessRule($rule)
        $directory.SetAccessControl($acl)
    }
    $acl = $directory.GetAccessControl()
    $rules = @($acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))
    if ($acl.GetOwner([Security.Principal.SecurityIdentifier]) -ne $sid -or -not $acl.AreAccessRulesProtected -or
        $rules.Count -ne 1 -or $rules[0].IdentityReference -ne $sid -or $rules[0].AccessControlType -ne 'Allow' -or
        $rules[0].FileSystemRights -ne 'FullControl' -or [int]$rules[0].InheritanceFlags -ne 3 -or $rules[0].PropagationFlags -ne 'None') {
        throw 'The workspace directory is not private.'
    }
    return $true
}

function Read-StartTime($pidValue) {
    try { $process = [Diagnostics.Process]::GetProcessById([int]$pidValue) }
    catch {
        if ($_.Exception.GetBaseException() -is [ArgumentException]) { return $null }
        throw
    }
    try { return $process.StartTime.ToUniversalTime().Ticks.ToString([Globalization.CultureInfo]::InvariantCulture) }
    finally { $process.Dispose() }
}

function Read-Entries($directory) {
    return ,@([IO.Directory]::EnumerateFileSystemEntries($directory) | ForEach-Object {
        @{ name = [IO.Path]::GetFileName($_); hidden = [bool]([IO.File]::GetAttributes($_) -band [IO.FileAttributes]::Hidden) }
    })
}

function Answer($request) {
    switch ($request.type) {
        'volume' { return [string]([IO.DriveInfo]::new($request.root).DriveType) }
        'entries' { return ,(Read-Entries $request.directory) }
        'downloads' { return Read-Downloads }
        'privateDirectory' { return Set-Or-VerifyPrivateDirectory $request.path $request.created }
        'startTime' { return Read-StartTime $request.pid }
        'move' { [ImageFilesToPDFNative]::MoveExclusive($request.from, $request.to); return $true }
        default { throw 'Unknown helper request.' }
    }
}

while ($null -ne ($line = $reader.ReadLine())) {
    try {
        $request = ConvertFrom-Json -InputObject $line
        $value = Answer $request
        $response = @{ ok = $true; value = $value }
    } catch {
        $fault = $_.Exception.GetBaseException()
        $code = if ($fault -is [ComponentModel.Win32Exception]) { $fault.NativeErrorCode } else { $fault.HResult }
        $response = @{ ok = $false; code = $code; diagnostic = $fault.Message }
    }
    $writer.WriteLine((ConvertTo-Json -InputObject $response -Depth 6 -Compress))
}
`;

function windowsHelperArgs() {
    return ["-NoLogo", "-NoProfile", "-NonInteractive", "-OutputFormat", "Text", "-EncodedCommand", Buffer.from(WINDOWS_HELPER, "utf16le").toString("base64")];
}

module.exports = { windowsHelperArgs };
