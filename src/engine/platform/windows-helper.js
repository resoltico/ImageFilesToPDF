"use strict";
const { Buffer } = require("node:buffer");

const WINDOWS_HELPER = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class ImageFilesToPDFNative {
    private const uint ReadAttributes = 0x80, ShareAll = 7, OpenExisting = 3, OpenReparsePoint = 0x00200000;
    private const uint DirectoryAttribute = 0x10, ReparsePointAttribute = 0x400;
    private const int FileAttributeTagInfo = 9;
    private const uint Placeholder = 1, Partial = 0x10, InvalidState = UInt32.MaxValue;

    [StructLayout(LayoutKind.Sequential)]
    private struct AttributeTag {
        public uint Attributes;
        public uint ReparseTag;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern bool SetConsoleCtrlHandler(IntPtr handler, bool add);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, ExactSpelling = true, SetLastError = true)]
    private static extern bool MoveFileExW(string from, string to, uint flags);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, ExactSpelling = true, SetLastError = true)]
    private static extern SafeFileHandle CreateFileW(string file, uint access, uint share, IntPtr security,
        uint disposition, uint flags, IntPtr template);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, ExactSpelling = true, SetLastError = true)]
    private static extern uint GetFileAttributesW(string path);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetFileInformationByHandleEx(SafeFileHandle file, int kind, out AttributeTag tag, uint size);

    [DllImport("cldapi.dll", ExactSpelling = true)]
    private static extern uint CfGetPlaceholderStateFromAttributeTag(uint attributes, uint tag);

    [DllImport("cldapi.dll", ExactSpelling = true)]
    private static extern int CfHydratePlaceholder(SafeFileHandle file, long offset, long length, uint flags, IntPtr overlapped);

    public static void MoveExclusive(string from, string to) {
        // With no flags the move cannot overwrite or fall back to a copy.
        if (!MoveFileExW(from, to, 0)) {
            throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        }
    }

    public static bool HydrateCloudFile(string path) {
        uint attributes = GetFileAttributesW(path);
        if (attributes == UInt32.MaxValue) { throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error()); }
        // Ordinary files can be on filesystems without reparse-tag support.
        if ((attributes & (DirectoryAttribute | ReparsePointAttribute)) != ReparsePointAttribute) { return false; }
        using (var file = CreateFileW(path, ReadAttributes, ShareAll, IntPtr.Zero, OpenExisting, OpenReparsePoint, IntPtr.Zero)) {
            if (file.IsInvalid) { throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error()); }
            AttributeTag tag;
            if (!GetFileInformationByHandleEx(file, FileAttributeTagInfo, out tag, (uint)Marshal.SizeOf(typeof(AttributeTag)))) {
                throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
            }
            if ((tag.Attributes & (DirectoryAttribute | ReparsePointAttribute)) != ReparsePointAttribute) { return false; }
            uint state = CfGetPlaceholderStateFromAttributeTag(tag.Attributes, tag.ReparseTag);
            if (state == InvalidState || (state & (Placeholder | Partial)) != (Placeholder | Partial)) { return false; }
            // A synchronous request through EOF settles hydration before the engine records admission facts.
            Marshal.ThrowExceptionForHR(CfHydratePlaceholder(file, 0, -1, 0, IntPtr.Zero));
            return true;
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
        'hydrateCloudFile' { return [ImageFilesToPDFNative]::HydrateCloudFile($request.path) }
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
