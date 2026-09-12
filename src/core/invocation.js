"use strict";

/*
 * Invocation parsing.
 *
 * osascript forwards its own "--" argument separator into run(), so the
 * script's first argument is "--" rather than the caller's first real
 * argument. Dropping leading separators makes both of these equivalent, which
 * is what lets the integration suite run unattended:
 *
 *     osascript -l JavaScript script.jxa -- --headless config.json image
 *     osascript -l JavaScript script.jxa    --headless config.json image
 */

const HEADLESS_FLAG = "--headless";
const ARGUMENT_SEPARATOR = "--";

/*
 * Shortcuts does not hand over a flat list. A Quick Action on a Finder
 * selection arrives as [[file, file, ...], parameters]: the selection nested
 * one level, followed by an object that is not a file at all.
 *
 * Flattened, because String() on an array of paths produces a comma-joined
 * string that still begins with "/" and still ends in ".jpg", so it survives
 * both the path check and the extension check and only fails at "no such
 * file". One image happened to work -- a single-element array stringifies to
 * just its element -- which is what made this look like a multi-image bug
 * rather than a shape the code never anticipated.
 *
 * The trailing parameters object needs no special case: it resolves to
 * nothing that looks like an image and is dropped by the same filter that
 * drops a selected text file.
 */
function normalizeInvocationInput(input) {
    if (input === undefined || input === null) {
        return [];
    }

    const items = (Array.isArray(input) ? input : [input]).flat(Infinity);

    while (items.length > 0 && String(items[0]) === ARGUMENT_SEPARATOR) {
        items.shift();
    }

    return items;
}

function isHeadlessInput(input) {
    const items = normalizeInvocationInput(input);

    return items.length > 0 && String(items[0]) === HEADLESS_FLAG;
}

/*
 * Finder hands over file URLs rather than POSIX paths.
 *
 * Parsed rather than stripped of a prefix. Taking "file://" off the front and
 * keeping the rest treats the authority as though it were part of the path:
 * "file://remotehost/tmp/a.png" became "remotehost/tmp/a.png", which is a
 * relative path, and the filesystem answers a relative path against whatever
 * the process's working directory happens to be. Matching the longer prefix
 * "file://localhost" first made it worse rather than better --
 * "file://localhostevil/tmp/a.png" became "evil/tmp/a.png".
 *
 * A file URL denotes a local absolute path or it denotes nothing this action
 * can open. "" is the existing answer for an item that is not a path, and
 * selection.js turns it into a stated rejection naming the URL, which is what
 * somebody who selected it needs to read.
 */
const FILE_URL = /^file:\/\/(?<authority>[^/]*)(?<path>\/.*)$/iu;
const LOCAL_HOST = "localhost";

function isLocalAuthority(authority) {
    return authority === "" || authority.toLowerCase() === LOCAL_HOST;
}

/*
 * An escape that will not decode is left as it was found, deliberately. A
 * host that hands over "file:///Users/x/100%.png" unencoded raises here, and
 * the undecoded string is the correct path: refusing it would turn a file
 * that converts today into a rejection. The authority was the defect.
 */
function decodePath(path) {
    try {
        return decodeURIComponent(path);
    } catch {
        return path;
    }
}

function decodeFileUrl(value) {
    const match = FILE_URL.exec(String(value));

    if (!match || !isLocalAuthority(match.groups.authority)) {
        return "";
    }

    return decodePath(match.groups.path);
}

module.exports = { normalizeInvocationInput, isHeadlessInput, decodeFileUrl };
