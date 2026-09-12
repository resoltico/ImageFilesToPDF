"use strict";

const { CP } = require("../core/executables.js");
const { errorMessage, isUserCancelled } = require("../core/errors.js");
const { runArgv } = require("./shell.js");
const { openStaging } = require("./staging-area.js");
const { fileFacts, SIZE_UNKNOWN } = require("./file-facts.js");

/*
 * Putting the PDF into the output folder, in a place of this run's own.
 *
 * Only needed when the finished PDF cannot be linked into place from the
 * workspace -- another volume, a filesystem without hard links, or a host
 * that refuses -- and transfer.js decides that. What matters here is that the
 * place was made rather than found: the claim that follows publishes whatever
 * is in it, and cleanup afterwards empties it.
 */

function mismatch(written, expected) {
    return [`the staged file is ${written} bytes where ${expected} were expected`];
}

/*
 * The copy goes into a directory nothing else has, so cp is asked plainly:
 * there is nothing there to decline over. A copy is not atomic and can fail
 * after writing part of the file or all of it, which is why the size is
 * checked and why the place is this attempt's to clear away either way.
 */
/*
 * What went wrong, and whether it was the person stopping rather than the
 * filesystem refusing. `made` says whether there is a place to clear away.
 */
function gaveUp(error, made) {
    return {
        reasons: [errorMessage(error)],
        made,
        cancelled: isUserCancelled(error)
    };
}

function copyBeside(job, staged, area, expected) {
    try {
        openStaging(job.app, area);
    } catch (error) {
        return gaveUp(error, false);
    }

    try {
        runArgv(job.app, [CP, staged, area.file], "copying the PDF into the output folder");
    } catch (error) {
        return gaveUp(error, true);
    }

    const written = fileFacts(job.app, area.file);

    return expected !== SIZE_UNKNOWN && written.size === expected
        ? { reasons: [], made: true, identity: written.identity }
        : { reasons: mismatch(written.size, expected), made: true };
}

module.exports = { copyBeside };
