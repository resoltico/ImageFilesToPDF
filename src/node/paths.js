"use strict";
const path = require("node:path");
const { platform } = require("node:process");
const { fileURLToPath } = require("node:url");
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

function decodeLocalUrl(text) {
    const url = new URL(text);
    if (!/^file:\/\//iu.test(text) || url.host || url.username || url.password || url.search || url.hash) {
        throw new Error("A local absolute file URL is required.");
    }
    return fileURLToPath(url);
}

function localPath(value) {
    let text = value;
    if (/^file:/iu.test(text)) { text = decodeLocalUrl(text); }
    else if (!(WINDOWS && DRIVE.test(text)) && /^[a-z][a-z\d+.-]*:/iu.test(text)) { throw new Error("A local path is required."); }
    if (!text.isWellFormed() || text.includes("\0") || text.includes("\uFFFD")) { throw new Error("The path cannot be transported losslessly."); }
    if (WINDOWS && !ordinaryWindowsPath(text)) { throw new Error("The Windows pathname is ambiguous or reserved."); }
    const absolute = path.resolve(text);
    if (WINDOWS && !ABSOLUTE_DRIVE.test(absolute)) { throw new Error("A local drive pathname is required."); }
    const stable = WINDOWS ? absolute.replace(/\\/gu, "/") : absolute;
    const slash = WINDOWS ? /[/\\]$/u : /\/$/u;
    return slash.test(text) && !stable.endsWith("/") ? `${stable}/` : stable;
}

function resolvedSource(value) {
    try { return { path: localPath(value) }; }
    catch {
        const remote = !(WINDOWS && DRIVE.test(value)) && /^[a-z][a-z\d+.-]*:/iu.test(value) &&
            (!/^file:/iu.test(value) || /^file:\/\/[^/]+/iu.test(value) && !/^file:\/\/localhost\//iu.test(value));
        return { refusal: selectionRefusal("", remote ? "remote-url" : "not-a-path", value) };
    }
}

function standardize(value) {
    const normalized = path.resolve(value);
    return WINDOWS ? normalized.replace(/\\/gu, "/") : normalized;
}

function outputName(record, distinguish) {
    const name = outputNameForSeparate(record, distinguish);
    return WINDOWS && DEVICE.test(name) ? `_${name}` : name;
}

module.exports = { outputName, WINDOWS, localPath, resolvedSource, standardize, ordinaryWindowsPath };
