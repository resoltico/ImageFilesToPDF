"use strict";
const { Buffer } = require("node:buffer");
const { env } = require("node:process");
const path = require("node:path");
const { OperationError } = require("../core/errors.js");
const { commandOutput } = require("./processes.js");

const ATTRIBUTES = `
$p = [Environment]::GetEnvironmentVariable('IFTP_NATIVE_PATH')
$drive = [IO.DriveInfo]::new([IO.Path]::GetPathRoot($p)).DriveType
if ($drive -ne 'Fixed' -and $drive -ne 'Removable') { throw 'A local drive is required.' }
$parts = [Collections.Generic.Stack[string]]::new()
for ($item = $p; $item; $item = [IO.Path]::GetDirectoryName($item)) { $parts.Push($item) }
foreach ($item in $parts) {
  try { $attributes = [IO.File]::GetAttributes($item) }
  catch {
    if ($_.Exception.GetBaseException() -is [IO.FileNotFoundException] -or
        $_.Exception.GetBaseException() -is [IO.DirectoryNotFoundException]) {
      Write-Output 'missing'
      exit
    }
    throw
  }
  if ($attributes -band [IO.FileAttributes]::ReparsePoint) {
    Write-Output 'link'
    exit
  }
}
if ($attributes -band [IO.FileAttributes]::Hidden) { Write-Output 'hidden' }
else { Write-Output 'ordinary' }
`;

const START_TIME = `
try { $p = [Diagnostics.Process]::GetProcessById([int]$env:IFTP_NATIVE_PID) }
catch {
  if ($_.Exception.GetBaseException() -is [ArgumentException]) { Write-Output 'absent'; exit }
  throw
}
try { Write-Output ($p.StartTime.ToUniversalTime().Ticks.ToString([Globalization.CultureInfo]::InvariantCulture)) }
finally { $p.Dispose() }
`;

const PRIVATE_DIRECTORY = `
$p = $env:IFTP_NATIVE_PATH
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
if ([IO.File]::GetAttributes($p) -band [IO.FileAttributes]::ReparsePoint) { throw 'A directory cannot be a reparse point.' }
$directory = [IO.DirectoryInfo]::new($p)
if ($env:IFTP_NATIVE_NEW -eq 'yes') {
  $acl = [Security.AccessControl.DirectorySecurity]::new()
  $acl.SetOwner($sid)
  $acl.SetAccessRuleProtection($true, $false)
  $rule = [Security.AccessControl.FileSystemAccessRule]::new($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
  $acl.AddAccessRule($rule)
  $directory.SetAccessControl($acl)
}
$acl = $directory.GetAccessControl()
if ($acl.GetOwner([Security.Principal.SecurityIdentifier]) -ne $sid) { throw 'Unexpected workspace owner.' }
$rules = @($acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier]))
if (-not $acl.AreAccessRulesProtected -or $rules.Count -ne 1 -or $rules[0].IdentityReference -ne $sid -or
  $rules[0].AccessControlType -ne 'Allow' -or $rules[0].FileSystemRights -ne 'FullControl' -or
  [int]$rules[0].InheritanceFlags -ne 3 -or $rules[0].PropagationFlags -ne 'None') {
  throw 'The workspace directory is not private.'
}
`;

function windowsNative(commands) {
    const root = env.SystemRoot;
    if (!root || !/^[a-z]:[/\\]/iu.test(root)) { throw new OperationError("The Windows system directory could not be located."); }
    const powershell = path.win32.join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    function run(script, values, label) {
        const encoded = Buffer.from(`$ErrorActionPreference = 'Stop'\n${script}`, "utf16le").toString("base64");
        const argv = [powershell, "-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded];
        return commandOutput(commands.request(argv, { env: values, detached: false }), argv.slice(0, 1), label).trim();
    }
    return {
        attributes: (file) => run(ATTRIBUTES, { IFTP_NATIVE_PATH: path.win32.normalize(file) }, "checking Windows file attributes"),
        startTime(pid) {
            const output = run(START_TIME, { IFTP_NATIVE_PID: String(pid) }, "checking the Windows process lifetime");
            if (output === "absent") { return null; }
            return /^\d+$/u.test(output) ? output : undefined;
        },
        privateDirectory: (file, created) => run(PRIVATE_DIRECTORY,
            { IFTP_NATIVE_PATH: path.win32.normalize(file), IFTP_NATIVE_NEW: created ? "yes" : "no" }, "checking the private workspace access")
    };
}
module.exports = { windowsNative };
