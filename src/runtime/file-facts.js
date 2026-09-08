"use strict";

const { STAT } = require("../core/executables.js");
const { tryArgv } = require("./shell.js");

/*
 * Which file this is, and how large.
 *
 * The volume it is on and its number on that volume, which is what makes a
 * published PDF provable rather than plausible: a hard link shares them with
 * the file it was made from and a rename carries them along, so a name
 * holding the same pair is holding the file this run put there. Measured, and
 * the size comes back in the same call because the copy has to be checked
 * anyway.
 *
 * Not knowing is its own answer, and it is "": a stat that could not be made
 * is not a file that is absent, and an identity nobody could read must not
 * compare equal to anything -- including another that could not be read.
 */

const SIZE_UNKNOWN = -1;
const UNIDENTIFIED = { identity: "", size: SIZE_UNKNOWN };

// Device, file number and size, in that order, from one call.
const FORMAT = "-f%d:%i:%z";

function factsFrom(text) {
    const [device, number, size] = String(text).trim().split(":");
    const bytes = parseInt(size, 10);

    return device && number && isFinite(bytes)
        ? { identity: `${device}:${number}`, size: bytes }
        : UNIDENTIFIED;
}

/*
 * A stat that could not be made comes back as no text, which is no identity:
 * the same answer, by the same route, as a stat that named nothing.
 */
function fileFacts(app, path) {
    return factsFrom(tryArgv(app, [STAT, FORMAT, path]));
}

module.exports = { fileFacts, factsFrom, SIZE_UNKNOWN };
