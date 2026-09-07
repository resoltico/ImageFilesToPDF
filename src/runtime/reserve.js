"use strict";

const { SH } = require("../core/executables.js");
const { runArgv } = require("./shell.js");

/*
 * Taking a name, exclusively, before anything is written to it.
 *
 * This is where the promise not to overwrite anything comes from, and it is
 * the only ownership fact this code has: the name existed, or it did not and
 * now it is ours. Everything downstream -- what may be written, what may be
 * removed -- follows from that rather than from what some later command
 * happened to report.
 *
 * The shell's noclobber redirection is O_CREAT|O_EXCL, which is the one
 * exclusive create reachable from here. Measured: it takes a free name and
 * refuses a file, a folder, and a link whose target is gone -- on APFS and on
 * a FAT-formatted volume alike, which matters because a FAT volume is where
 * the alternative, a hard link, cannot be made at all.
 *
 * The script is a constant and the path is an argument to it, so nothing is
 * assembled by concatenation here any more than anywhere else.
 */

const CLAIM_EMPTY = 'set -C; : > "$0"';

function reserveName(app, path, label) {
    runArgv(app, [SH, "-c", CLAIM_EMPTY, path], label);
}

module.exports = { reserveName };
