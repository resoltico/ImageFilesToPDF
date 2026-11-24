"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { env } = require("node:process");

const XDG_DOWNLOAD = /^[ \t]*XDG_DOWNLOAD_DIR[ \t]*=[ \t]*"(?<value>(?:\\[^\n]|[^"\\\n])*)"[ \t]*(?:#[^\n]*)?$/mu;

function absoluteOr(directory, fallback) {
    return typeof directory === "string" && path.posix.isAbsolute(directory) ? directory : fallback;
}

function linuxDownload(text, home) {
    const match = XDG_DOWNLOAD.exec(text);
    if (!match) { return null; }
    const raw = match.groups.value;
    const expanded = raw === "$HOME" || raw.startsWith("$HOME/") ? home + raw.slice("$HOME".length) : raw;
    const decoded = expanded.replace(/\\(?<character>["\\$\x60])/gu, (escaped, character) => character);
    if (!path.posix.isAbsolute(decoded)) { return null; }
    const resolved = path.posix.resolve(decoded);
    return resolved === path.posix.resolve(home) ? null : resolved;
}

function linuxDownloads(home) {
    const base = absoluteOr(env.XDG_CONFIG_HOME, path.join(home, ".config"));
    try { return linuxDownload(fs.readFileSync(path.join(base, "user-dirs.dirs"), "utf8"), home); }
    catch (error) { if (error.code === "ENOENT" || error.code === "ENOTDIR") { return null; } throw error; }
}

module.exports = { absoluteOr, linuxDownload, linuxDownloads };
