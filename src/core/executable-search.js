"use strict";
const { compareText } = require("./ordering.js");

const SYSTEM_PATHS = "/etc/paths";
const SYSTEM_FRAGMENTS = "/etc/paths.d";
const CONVENTIONAL_DIRECTORIES = ["/opt/homebrew/bin", "/usr/local/bin", "/opt/local/bin"];
const TOOL_NAMES = Object.freeze(["vips", "vipsheader", "pdfcpu"]);
const FINDER_EXECUTABLES = Object.freeze(["node", ...TOOL_NAMES]);

function absoluteMacPath(value) {
    return typeof value === "string" && value.startsWith("/") && !value.includes("\0");
}


function pathFileOrder(left, right) {
    const leftPrefix = /^\d+/u.exec(left)?.[0];
    const rightPrefix = /^\d+/u.exec(right)?.[0];
    if (leftPrefix && rightPrefix) {
        const difference = Number(BigInt(leftPrefix) - BigInt(rightPrefix));
        return difference || compareText(left.slice(leftPrefix.length), right.slice(rightPrefix.length)) || compareText(left, right);
    }
    return compareText(left, right);
}

// A path file's text, or null when it is missing, not a regular file, or unreadable.
function searchDirectories({ systemPaths, conventional = CONVENTIONAL_DIRECTORIES }) {
    const { defaults, fragments } = systemPaths;
    const files = [defaults, ...Object.keys(fragments).sort(pathFileOrder).map((name) => fragments[name])].filter((file) => file !== null);
    const listed = files.flatMap((file) => file.split("\n").map((line) => line.trim())).filter(absoluteMacPath);
    return [...new Set([...listed, ...conventional])];
}

module.exports = { SYSTEM_PATHS, SYSTEM_FRAGMENTS, TOOL_NAMES, FINDER_EXECUTABLES, absoluteMacPath, searchDirectories };
