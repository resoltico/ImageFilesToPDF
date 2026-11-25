"use strict";
const path = require("node:path");

const XDG_DOWNLOAD = /^[ \t]*XDG_DOWNLOAD_DIR[ \t]*=[ \t]*"(?<value>(?:\\[^\n]|[^"\\\n])*)"[ \t]*(?:#[^\n]*)?$/mu;

function absoluteOr(directory, fallback) {
    return typeof directory === "string" && path.posix.isAbsolute(directory) ? directory : fallback;
}

function linuxDownload(text, home) {
    const match = XDG_DOWNLOAD.exec(text);
    if (!match) { return null; }
    const raw = match.groups.value;
    // A bare $HOME is the home folder itself, which is refused below either way.
    const expanded = raw.startsWith("$HOME/") ? home + raw.slice("$HOME".length) : raw;
    const decoded = expanded.replace(/\\(?<character>["\\$\x60])/gu, (escaped, character) => character);
    if (!path.posix.isAbsolute(decoded)) { return null; }
    const resolved = path.posix.resolve(decoded);
    return resolved === path.posix.resolve(home) ? null : resolved;
}

module.exports = { absoluteOr, linuxDownload };
