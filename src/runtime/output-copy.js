"use strict";

const { CP } = require("../core/executables.js");
const { errorMessage } = require("../core/errors.js");
const { dirname } = require("../core/paths.js");
const { runArgv, pathIsTaken } = require("./shell.js");
const { fileFacts, SIZE_UNKNOWN } = require("./file-facts.js");
const { nonce } = require("./workspace.js");

/*
 * Putting the PDF into the output folder under a name of this run's own.
 *
 * Only needed when the finished PDF cannot be linked into place from the
 * workspace -- another volume, a filesystem without hard links, or a host
 * that refuses -- and transfer.js decides that. What matters here is that
 * what ends up under the staging name is this run's own file, because the
 * claim that follows publishes whatever is under it.
 */

/*
 * Hidden, so a half-copied file never shows in the output folder; beside the
 * destination, so the claim that follows is on one volume; and unique to this
 * attempt, so what is removed afterwards is only ever what this attempt made.
 */
function stagingPath(finalPath) {
    return `${dirname(finalPath)}.ImageFilesToPDF-${nonce()}.part`;
}

function mismatch(written, expected) {
    return [`the staged file is ${written} bytes where ${expected} were expected`];
}

/*
 * A copy is not atomic and cp -n exits zero when it declines, so the file at
 * the staging name is this run's only if the name was free before it started
 * and the size matches afterwards. A name that is not free is not borrowed:
 * publication stops instead, because adopting one would publish whatever
 * bytes happened to be under it.
 *
 * A copy that failed still made whatever is under that name. cp is documented
 * to leave the destination in place after an error, and it can fail after
 * writing part of the file or all of it -- so from the moment it is run, the
 * name is this attempt's to clear away.
 */
function copyBeside(app, staged, incoming, expected) {
    if (pathIsTaken(app, incoming)) {
        return { made: false, reasons: ["the staging name was already taken"] };
    }

    try {
        runArgv(app, [CP, "-n", staged, incoming], "copying the PDF into the output folder");
    } catch (error) {
        return { made: true, reasons: [errorMessage(error)] };
    }

    const written = fileFacts(app, incoming);

    return expected !== SIZE_UNKNOWN && written.size === expected
        ? { made: true, reasons: [], identity: written.identity }
        : { made: true, reasons: mismatch(written.size, expected) };
}

module.exports = { stagingPath, copyBeside };
