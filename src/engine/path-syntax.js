"use strict";
const path = require("node:path");

const DRIVE_PREFIX_LENGTH = 2;
const DRIVE = /^[a-z]:/iu;
const ABSOLUTE_DRIVE = /^[a-z]:[/\\]/iu;
const DEVICE = /^(?:CON|PRN|AUX|NUL|CONIN\$|CONOUT\$|(?:COM|LPT)[1-9¹²³])(?:\.|$)/iu;
// eslint-disable-next-line no-control-regex -- Win32 forbids control characters in ordinary path components.
const INVALID = /[<>:"|?*\x00-\x1F]|[ .]$/u;

function isDriveAbsolute(value) {
    return ABSOLUTE_DRIVE.test(value);
}

function ordinaryWindowsPath(value) {
    if (/^[/\\]/u.test(value) && !isDriveAbsolute(value)) { return false; }
    if (DRIVE.test(value) && !isDriveAbsolute(value)) { return false; }
    return value.slice(DRIVE.test(value) ? DRIVE_PREFIX_LENGTH : 0).split(/[/\\]/u).every((part) =>
        part === "." || part === ".." || (!INVALID.test(part) && !DEVICE.test(part)));
}

function windowsToolPath(file) {
    return `\\\\?\\${path.win32.normalize(file)}`;
}

function windowsOutputName(name) {
    return DEVICE.test(name) ? `_${name}` : name;
}

module.exports = { isDriveAbsolute, ordinaryWindowsPath, windowsToolPath, windowsOutputName };
