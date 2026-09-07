"use strict";

const { CP } = require("../core/executables.js");
const { errorMessage } = require("../core/errors.js");
const { dirname } = require("../core/paths.js");
const { runArgv } = require("./shell.js");
const { reserveName } = require("./reserve.js");
const { fileFacts, SIZE_UNKNOWN } = require("./file-facts.js");
const { nonce } = require("./workspace.js");

/*
 * Putting the PDF into the output folder under a name of this run's own.
 *
 * Only needed when the finished PDF cannot be linked into place from the
 * workspace -- another volume, a filesystem without hard links, or a host
 * that refuses -- and transfer.js decides that. What matters here is that the
 * name is taken before anything is written to it: the claim that follows
 * publishes whatever is under it, and cleanup afterwards removes it.
 *
 * Checking whether the name looked free was not the same thing. It left the
 * question of whose file it was to be inferred from how the copy turned out,
 * and a copy refused because someone else had taken the name in the meantime
 * was read as this run having made it -- so cleanup deleted their file.
 */

/*
 * Hidden, so a half-copied file never shows in the output folder; beside the
 * destination, so the claim that follows is on one volume; and unique to this
 * attempt, so the name it reserves is one nothing else would ask for.
 */
function stagingPath(finalPath) {
    return `${dirname(finalPath)}.ImageFilesToPDF-${nonce()}.part`;
}

function mismatch(written, expected) {
    return [`the staged file is ${written} bytes where ${expected} were expected`];
}

/*
 * The copy goes over this run's own empty file, so cp is asked to overwrite
 * rather than to decline: what it would decline is ours. A copy is not atomic
 * and can fail after writing part of the file or all of it, which is why the
 * size is checked and why the name is this attempt's to clear away either
 * way -- it was reserved before the copy started.
 */
function copyBeside(app, staged, incoming, expected) {
    try {
        reserveName(app, incoming, "taking a name for the PDF in the output folder");
    } catch (error) {
        return { reasons: [errorMessage(error)], mine: [] };
    }

    try {
        runArgv(app, [CP, staged, incoming], "copying the PDF into the output folder");
    } catch (error) {
        return { reasons: [errorMessage(error)], mine: [incoming] };
    }

    const written = fileFacts(app, incoming);

    return expected !== SIZE_UNKNOWN && written.size === expected
        ? { reasons: [], mine: [incoming], identity: written.identity }
        : { reasons: mismatch(written.size, expected), mine: [incoming] };
}

module.exports = { stagingPath, copyBeside };
