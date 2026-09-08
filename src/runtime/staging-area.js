"use strict";

const { MKDIR, RMDIR } = require("../core/executables.js");
const { dirname } = require("../core/paths.js");
const { runArgv, removeFile } = require("./shell.js");
const { nonce } = require("./workspace.js");

/*
 * A place of this run's own, beside the destination, to put the PDF in when
 * it cannot be linked into place from the workspace.
 *
 * Made rather than found: mkdir either creates the directory or fails, and it
 * fails for anything already at that name -- a file, a folder, a link, a
 * named pipe. Measured, all four. So everything inside it is this attempt's,
 * which is what makes copying into it and clearing it away afterwards safe.
 *
 * Taking a name by opening it was not the same thing. The shell's noclobber
 * redirection refuses a regular file, and quietly accepts a link pointing at
 * something that is not one -- measured, a link to /dev/null was accepted and
 * nothing was created, so the run recorded a name it did not own and cleanup
 * deleted the link. On a named pipe it does worse: it waits for a reader, and
 * there is no timeout above it to end that wait.
 *
 * Hidden, and named for this attempt, so it is neither in the way nor
 * something another run would ask for.
 */

const READY = "ready.pdf";

function stagingArea(finalPath) {
    const directory = `${dirname(finalPath)}.ImageFilesToPDF-${nonce()}`;

    return { directory, file: `${directory}/${READY}` };
}

function openStaging(app, area) {
    runArgv(
        app,
        [MKDIR, area.directory],
        "making a place for the PDF in the output folder"
    );
}

/*
 * Whatever this run put in there, and then the directory itself. rmdir
 * removes an empty directory and refuses one that is not, so a directory
 * something else has written into is left alone rather than emptied.
 */
function closeStaging(app, area) {
    removeFile(app, area.file);

    try {
        runArgv(app, [RMDIR, area.directory], "clearing the place it was in");
    } catch {
        // A directory that cannot be removed is not a failure of the run.
    }
}

module.exports = { stagingArea, openStaging, closeStaging };
