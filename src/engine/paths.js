"use strict";
const path = require("node:path");
const { platform } = require("node:process");
const { classifyInput } = require("../core/input-items.js");
const { outputNameForSeparate } = require("../core/naming.js");
const { selectionRefusal } = require("../core/selection-policy.js");

const WINDOWS = platform === "win32";
const DRIVE_PREFIX_LENGTH = 2;
const DRIVE = /^[a-z]:/iu;
const ABSOLUTE_DRIVE = /^[a-z]:[/\\]/iu;
const DEVICE = /^(?:CON|PRN|AUX|NUL|CONIN\$|CONOUT\$|(?:COM|LPT)[1-9¹²³])(?:\.|$)/iu;
// eslint-disable-next-line no-control-regex -- Win32 forbids control characters in ordinary path components.
const INVALID = /[<>:"|?*\x00-\x1F]|[ .]$/u;

function ordinaryWindowsPath(value) {
    if (/^[/\\]/u.test(value) && !ABSOLUTE_DRIVE.test(value)) { return false; }
    if (DRIVE.test(value) && !ABSOLUTE_DRIVE.test(value)) { return false; }
    return value.slice(DRIVE.test(value) ? DRIVE_PREFIX_LENGTH : 0).split(/[/\\]/u).every((part) =>
        part === "." || part === ".." || (!INVALID.test(part) && !DEVICE.test(part)));
}

function canonicalPath(text) {
    if (WINDOWS && !ordinaryWindowsPath(text)) { throw new Error("The Windows pathname is ambiguous or reserved."); }
    const absolute = path.resolve(text);
    if (WINDOWS && !ABSOLUTE_DRIVE.test(absolute)) { throw new Error("A local drive pathname is required."); }
    const stable = WINDOWS ? absolute.replace(/\\/gu, "/") : absolute;
    const slash = WINDOWS ? /[/\\]$/u : /\/$/u;
    return slash.test(text) && !stable.endsWith("/") ? `${stable}/` : stable;
}

function localPath(value) {
    const item = classifyInput(value, WINDOWS);
    if (!item.path) { throw new Error("A local path or file URL is required."); }
    return canonicalPath(item.path);
}

function resolvedSource(value) {
    const item = classifyInput(value, WINDOWS);
    if (!item.path) { return { refusal: selectionRefusal("", item.kind, value) }; }
    try { return { path: canonicalPath(item.path) }; }
    catch { return { refusal: selectionRefusal("", "not-a-path", value) }; }
}

function standardize(value) {
    const normalized = path.resolve(value);
    return WINDOWS ? normalized.replace(/\\/gu, "/") : normalized;
}

function toolPath(file) {
    return WINDOWS ? `\\\\?\\${path.win32.normalize(file)}` : file;
}

function outputName(record, distinguish) {
    const name = outputNameForSeparate(record, distinguish);
    return WINDOWS && DEVICE.test(name) ? `_${name}` : name;
}

module.exports = { outputName, toolPath, WINDOWS, localPath, resolvedSource, standardize, ordinaryWindowsPath };
