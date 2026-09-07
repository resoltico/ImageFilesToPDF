"use strict";

/*
 * A filesystem tree the walk can be driven against.
 *
 * Shaped like the real one: entries() lists a folder or answers null when it
 * cannot be read, and inspect() says what a path is and which file it is in
 * one answer, because that is what one call to attributesOfItemAtPath gives.
 *
 * Identity defaults to the path, which is what a filesystem where every name
 * is its own file would say. A test that wants two names to be one file --
 * which is what a Mac says by default, being case-insensitive -- passes them
 * the same identity.
 */
function treeOf(shape, kinds = {}, identities = {}) {
    return {
        entries: (path) => shape[path] ?? null,

        inspect(path) {
            const kind = kinds[path] ?? (shape[path] ? "directory" : "file");

            return {
                kind,
                // Nothing to read means nothing to identify.
                identity: kind === "missing" ? "" : identities[path] ?? path
            };
        },

        standardize: (path) => path.replace(/\/+$/u, "")
    };
}

module.exports = { treeOf };
