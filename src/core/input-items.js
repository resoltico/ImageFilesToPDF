"use strict";

const FILE_SCHEME = /^file:/iu;
const FILE_URL = /^file:\/\/(?<authority>[^/?#\\]*)(?<path>.*)/isu;
const SCHEME = /^[A-Za-z][A-Za-z\d+.-]*:/u;
const DRIVE = /^[A-Za-z]:/u;
const URL_DRIVE = /^\/[A-Za-z]:\//u;
const BAD_FILE_URL = /[?#\\\r\n]|%2f/iu;
const BAD_WINDOWS_FILE_URL = /%5c/iu;
// eslint-disable-next-line no-control-regex -- NUL cannot appear in a pathname.
const UNTRANSPORTABLE = /[\u0000\uFFFD\uD800-\uDFFF]/u;
const NOT_A_PATH = Object.freeze({ kind: "not-a-path" });
const REMOTE_URL = Object.freeze({ kind: "remote-url" });

function fileUrl(match, windows) {
    const { authority, path } = match.groups;
    if (authority !== "" && authority.toLowerCase() !== "localhost") { return REMOTE_URL; }
    if (!path.startsWith("/") || BAD_FILE_URL.test(path) || (windows && BAD_WINDOWS_FILE_URL.test(path))) { return NOT_A_PATH; }
    try {
        const decoded = decodeURIComponent(path);
        if (UNTRANSPORTABLE.test(decoded) || (windows && !URL_DRIVE.test(decoded))) { return NOT_A_PATH; }
        return { kind: "file-url", path: windows ? decoded.slice(1) : decoded };
    } catch {
        return NOT_A_PATH;
    }
}

/** Classifies a raw input item without resolving a working directory or consulting the filesystem. */
function classifyInput(value, windows = false) {
    if (typeof value !== "string" || value === "" || UNTRANSPORTABLE.test(value)) { return NOT_A_PATH; }
    if (!SCHEME.test(value) || (windows && DRIVE.test(value))) { return { kind: "path", path: value }; }
    if (!FILE_SCHEME.test(value)) { return REMOTE_URL; }
    const match = FILE_URL.exec(value);
    return match ? fileUrl(match, windows) : NOT_A_PATH;
}

module.exports = { classifyInput };
