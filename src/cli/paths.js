"use strict";

function nativeWindowsPath(path) {
    return /^[A-Za-z]:\//u.test(path) ? path.replace(/\//gu, "\\") : path;
}

module.exports = { nativeWindowsPath };
