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
 */
function decodeFileUrl(value) {
    const stripped = String(value)
        .replace(/^file:\/\/localhost/iu, "")
        .replace(/^file:\/\//iu, "");

    try {
        return decodeURIComponent(stripped);
    } catch {
        return stripped;
    }
}

module.exports = { normalizeInvocationInput, isHeadlessInput, decodeFileUrl };
