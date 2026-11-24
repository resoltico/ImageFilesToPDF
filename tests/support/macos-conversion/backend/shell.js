"use strict";

/*
 * POSIX shell quoting.
 *
 * Every argument is wrapped in single quotes with embedded single quotes
 * escaped, which is the one form that survives arbitrary filenames: no
 * expansion, no word splitting, no glob.
 */

function shellQuote(value) {
    const text = String(value);

    // NUL is exactly what this guard rejects; argv cannot carry it.
    // eslint-disable-next-line no-control-regex
    if (/\x00/u.test(text)) {
        throw new Error("Shell arguments cannot contain NUL bytes.");
    }

    return `'${text.replace(/'/gu, "'\\''")}'`;
}

function shellJoin(argumentsList) {
    return argumentsList.map(shellQuote).join(" ");
}

module.exports = { shellQuote, shellJoin };
