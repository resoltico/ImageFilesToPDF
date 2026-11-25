"use strict";
const path = require("node:path");

const DRIVE_PREFIX_LENGTH = 2;
const ABSOLUTE_DRIVE = /^[a-z]:[/\\]/iu;
const DEVICE = /^(?:CON|PRN|AUX|NUL|CONIN\$|CONOUT\$|(?:COM|LPT)[1-9¹²³])(?:\.|$)/iu;
// eslint-disable-next-line no-control-regex -- Win32 forbids control characters in ordinary path components.
const INVALID = /[<>:"|?*\x00-\x1F]|[ .]$/u;

// A drive letter and a colon at the very start, as in C:photo.png.
const DRIVE_LETTERS = "abcdefghijklmnopqrstuvwxyz";

function hasDrive(value) {
    return DRIVE_LETTERS.includes(value.charAt(0).toLowerCase()) && value.charAt(1) === ":";
}

function isDriveAbsolute(value) {
    return ABSOLUTE_DRIVE.test(value);
}

function ordinaryWindowsPath(value) {
    if (/^[/\\]/u.test(value) && !isDriveAbsolute(value)) { return false; }
    if (hasDrive(value) && !isDriveAbsolute(value)) { return false; }
    return value.slice(hasDrive(value) ? DRIVE_PREFIX_LENGTH : 0).split(/[/\\]/u).every((part) =>
        part === "." || part === ".." || (!INVALID.test(part) && !DEVICE.test(part)));
}

function windowsToolPath(file) {
    return `\\\\?\\${path.win32.normalize(file)}`;
}

function windowsOutputName(name) {
    return DEVICE.test(name) ? `_${name}` : name;
}

module.exports = { isDriveAbsolute, ordinaryWindowsPath, windowsToolPath, windowsOutputName };
