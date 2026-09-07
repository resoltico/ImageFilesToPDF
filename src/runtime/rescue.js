"use strict";

const { MKTEMP, MV } = require("../core/executables.js");
const { basename } = require("../core/paths.js");
const { runArgv, fileExists } = require("./shell.js");

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

/*
 * Where the finished PDF is, when publication did not put it where it was
 * meant to go.
 *
 * Asked, not assumed. Each step of publication moves the bytes, so the file
 * the run started with may be gone: a rename into the output folder empties
 * the workspace, and a rename onto a folder standing at the output path puts
 * the file inside it. Naming a path that is not there sends someone looking
 * for a document that does not exist, which is what the workspace path used
 * to do.
 *
 * The candidates are in the order the bytes travel, and the answer is the
 * first one that is actually there. When none of them is, the run cannot say
 * more than where it was aiming.
 */
function whereItIs(app, paths) {
    const inside = `${paths.final}/${basename(paths.incoming)}`;
    const candidates = [paths.staged, paths.incoming, inside];

    return candidates.find((path) => fileExists(app, path)) ?? "";
}

module.exports = { setAside, whereItIs };
