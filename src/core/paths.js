"use strict";

/*
 * Path string manipulation.
 *
 * These operate on POSIX path strings rather than touching the filesystem, so
 * they stay pure and testable.
 */

function basename(path) {
    // Without a separator, lastIndexOf is -1 and the slice is the whole name.
    const normalized = String(path).replace(/\/+$/u, "");
    return normalized.slice(normalized.lastIndexOf("/") + 1);
}

function dirname(path) {
    // Without a separator, lastIndexOf is -1 and the slice is empty.
    const text = String(path);
    return text.slice(0, text.lastIndexOf("/") + 1);
}

function fileStem(filename) {
    const value = String(filename);
    const index = value.lastIndexOf(".");

    return index > 0 ? value.slice(0, index) : value;
}

/*
 * Preserves Unicode while replacing separators/control characters and
 * collapsing underscores. Trims edge dots, then whitespace/underscores;
 * an empty result uses "image".
 */
function sanitizeFilename(filename) {
    const safe = String(filename)
        // eslint-disable-next-line no-control-regex -- Control characters are matched on purpose: they must not reach a filename.
        .replace(/[\x00-\x1f\x7f/:]/gu, "_")
        .replace(/_+/gu, "_")
        .replace(/^\.+|\.+$/gu, "")
        .replace(/^[\s_]+|[\s_]+$/gu, "");

    return safe.length > 0 ? safe : "image";
}

module.exports = {
    basename,
    dirname,
    fileStem,
    sanitizeFilename
};
