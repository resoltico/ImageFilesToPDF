"use strict";

const { MKTEMP, MV } = require("../core/executables.js");
const { basename } = require("../core/paths.js");
const { runArgv } = require("./shell.js");

const RECOVERY_PREFIX = "ImageFilesToPDF-recovered";

/*
 * A PDF that could not be published is still a finished PDF.
 *
 * It has been imported and validated by this point, so deleting it destroys
 * completed work over a failure that has nothing to do with its contents —
 * and the workspace it sits in is removed as soon as the run ends. It is
 * moved out of the way instead, and where it went is part of the failure.
 *
 * Best effort: if it cannot be moved it stays where it was built, and the
 * message says so rather than claiming a rescue that did not happen.
 */
function setAside(app, stagedPath) {
    try {
        const folder = String(runArgv(
            app,
            [MKTEMP, "-d", "-t", RECOVERY_PREFIX],
            "making a folder for the unpublished PDF"
        )).trim();
        const recovered = `${folder}/${basename(stagedPath)}`;

        runArgv(app, [MV, stagedPath, recovered], "setting the PDF aside");

        return recovered;
    } catch {
        return stagedPath;
    }
}

module.exports = { setAside };
