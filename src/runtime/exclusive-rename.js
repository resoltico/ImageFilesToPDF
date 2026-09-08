"use strict";

/*
 * Putting a file at a name that must not already exist, in one step.
 *
 * renamex_np with RENAME_EXCL is the operation this code wants everywhere and
 * can have almost everywhere: it creates the directory entry and moves the
 * file into it as one thing, and it fails rather than replace what is there.
 * Measured, through this bridge: a free name is taken, an occupied one, a
 * folder and a link whose target is gone are all refused with what is there
 * left exactly as it was, and the file keeps the number that identifies it,
 * so what was published can still be proved afterwards.
 *
 * It is reached through the C library rather than through Foundation, which
 * has no exclusive move. The header matters: renamex_np is declared in stdio,
 * and importing anything else leaves it undefined.
 *
 * Not every filesystem implements it. Measured: FAT32 does, exFAT does not --
 * plain rename works there and the exclusive form fails outright. What that
 * failure means is not distinguishable here, because errno is not exposed
 * through the bridge, so the caller decides by asking whether the name is
 * taken: the same question it asks when a hard link is refused.
 */

// From <stdio.h>: fail rather than replace an existing destination.
const RENAME_EXCL = 4;

function createRenamer(objc, ns) {
    if (!objc || !ns) {
        return null;
    }

    try {
        objc.import("stdio");
    } catch {
        return null;
    }

    if (typeof ns.renamex_np !== "function") {
        return null;
    }

    return {
        rename(from, to) {
            try {
                return ns.renamex_np(from, to, RENAME_EXCL) === 0;
            } catch {
                return false;
            }
        }
    };
}

module.exports = { createRenamer };
