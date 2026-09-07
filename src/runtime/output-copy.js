"use strict";

const { CP, STAT } = require("../core/executables.js");
const { errorMessage } = require("../core/errors.js");
const { dirname } = require("../core/paths.js");
const { runArgv, pathIsTaken } = require("./shell.js");
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

const SIZE_UNKNOWN = -1;

/*
 * Hidden, so a half-copied file never shows in the output folder; beside the
 * destination, so the claim that follows is on one volume; and unique to this
 * attempt, so what is removed afterwards is only ever what this attempt made.
 */
function stagingPath(finalPath) {
    return `${dirname(finalPath)}.ImageFilesToPDF-${nonce()}.part`;
}

function fileSize(app, path) {
    try {
        const text = runArgv(app, [STAT, "-f%z", path], "measuring the PDF");
        const value = parseInt(String(text).trim(), 10);

        return isFinite(value) ? value : SIZE_UNKNOWN;
    } catch {
        return SIZE_UNKNOWN;
    }
}

/*
 * A copy is not atomic and cp -n exits zero when it declines, so the file at
 * the staging name is this run's only if the name was free before it started
 * and the size matches afterwards. A name that is not free is not borrowed:
 * publication stops instead, because adopting one would publish whatever
 * bytes happened to be under it.
 */
function copyBeside(app, staged, incoming) {
    if (pathIsTaken(app, incoming)) {
        return { made: false, reasons: ["the staging name was already taken"] };
    }

    try {
        runArgv(app, [CP, "-n", staged, incoming], "copying the PDF into the output folder");
    } catch (error) {
        return { made: false, reasons: [errorMessage(error)] };
    }

    const expected = fileSize(app, staged);
    const written = fileSize(app, incoming);

    return expected !== SIZE_UNKNOWN && written === expected
        ? { made: true, reasons: [] }
        : {
            made: true,
            reasons: [`the staged file is ${written} bytes where ` +
                `${expected} were expected`]
        };
}

module.exports = { stagingPath, fileSize, copyBeside };
