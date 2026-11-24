"use strict";
const path = require("node:path");
const { platform } = require("node:process");
const { classifyInput } = require("../core/input-items.js");
const { outputNameForSeparate } = require("../core/naming.js");
const { isDriveAbsolute, ordinaryWindowsPath, windowsToolPath, windowsOutputName } = require("./path-syntax.js");
const { selectionRefusal } = require("../core/selection-policy.js");

const WINDOWS = platform === "win32";
function canonicalPath(text) {
    if (WINDOWS && !ordinaryWindowsPath(text)) { throw new Error("The Windows pathname is ambiguous or reserved."); }
    const absolute = path.resolve(text);
    if (WINDOWS && !isDriveAbsolute(absolute)) { throw new Error("A local drive pathname is required."); }
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
    return WINDOWS ? windowsToolPath(file) : file;
}

function outputName(record, distinguish) {
    const name = outputNameForSeparate(record, distinguish);
    return WINDOWS ? windowsOutputName(name) : name;
}

module.exports = { outputName, toolPath, WINDOWS, localPath, resolvedSource, standardize };
