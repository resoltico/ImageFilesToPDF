"use strict";

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
 * The trailing parameters object is removed by the interactive collector in
 * input.js, so that an invocation without files still falls back to Finder's
 * selection.
 */
function normalizeInvocationInput(input) {
    if (input === undefined || input === null) {
        return [];
    }

    return (Array.isArray(input) ? input : [input]).flat(Infinity);
}

module.exports = { normalizeInvocationInput };
