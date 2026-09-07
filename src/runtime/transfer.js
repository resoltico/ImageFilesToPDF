"use strict";

const { CP, LN, MV, STAT } = require("../core/executables.js");
const { errorMessage } = require("../core/errors.js");
const { dirname } = require("../core/paths.js");
const { runArgv, fileExists } = require("./shell.js");
const { nonce } = require("./workspace.js");

/*
 * Getting the bytes from the workspace to the output folder.
 *
 * One protocol for every destination, because the destination is not
 * something this code can see. The finished PDF is put into the output folder
 * under a hidden name of its own, checked there, and only then given the name
 * the user will see -- in a single operation that either creates that name or
 * fails.
 *
 * It used to be renamed straight to the final name, which is atomic only when
 * both ends are on one volume. Across volumes, Apple's mv copies to the
 * destination pathname it was given: measured, an interrupted move left
 * 3,211,264 bytes of a 1,258,291,200-byte file sitting under the name of the
 * finished document. Photographs on an external drive are an ordinary reason
 * for the two ends to differ.
 *
 * Where the PDF is built matters as much, and was settled the same way.
 * pdfcpu created the file in the user's Downloads folder; afterwards /bin/mv
 * could not rename it and /bin/cp could not even read it, both refused with
 * "Operation not permitted". In the same folder, on the same run, a file the
 * shell itself created could be renamed freely, and copying in from the
 * workspace was allowed. So nothing is built there -- and the fallbacks below
 * are exactly the operations that host permitted.
 *
 * Who owns the PDF while this is going on is publish.js.
 */

const SIZE_UNKNOWN = -1;

/*
 * Hidden, so the output folder never shows a half-finished document; beside
 * the destination, so the operation that follows is a rename within one
 * directory; and unique to this attempt, so removing it afterwards -- however
 * the attempt ended -- cannot remove anything else. Its name says who made it
 * and does not grow with the name of the PDF, which was long enough on its
 * own to be refused.
 */
function stagingPath(finalPath) {
    return `${dirname(finalPath)}.ImageFilesToPDF-${nonce()}.part`;
}

function fileSize(app, path) {
    try {
        const text = runArgv(
            app,
            [STAT, "-f%z", path],
            "measuring the PDF"
        );
        const value = parseInt(String(text).trim(), 10);

        return isFinite(value) ? value : SIZE_UNKNOWN;
    } catch {
        return SIZE_UNKNOWN;
    }
}

/*
 * The bytes are in the output folder under the staging name, or they are not
 * there at all. A rename is preferred -- one volume, no second copy of the
 * file -- and a copy is what the sandbox permitted when it refused the
 * rename. Either way the result is measured: a copy is not atomic, and a size
 * that cannot be read is not a size.
 */
function stageBeside(app, from, incoming, expected) {
    const refusals = [];

    for (const [tool, label] of [[MV, "moving"], [CP, "copying"]]) {
        try {
            runArgv(app, [tool, "-n", from, incoming], `${label} the PDF into the output folder`);

            const written = fileSize(app, incoming);

            return expected !== SIZE_UNKNOWN && written === expected
                ? { published: true, reasons: [] }
                : {
                    published: false,
                    reasons: [`the staged file is ${written} bytes where ` +
                        `${expected} were expected`]
                };
        } catch (error) {
            refusals.push(errorMessage(error));
        }
    }

    return { published: false, reasons: refusals };
}

/*
 * mv -n exits zero when it declines, so what is still under the staging name
 * is the only evidence that the output path was taken.
 */
function renameOnto(app, incoming, finalPath, refused) {
    try {
        runArgv(app, [MV, "-n", incoming, finalPath], "putting the PDF in place");
    } catch (error) {
        return { published: false, reasons: [refused, errorMessage(error)] };
    }

    return fileExists(app, incoming)
        ? { published: false, reasons: [refused, "the output path was taken"] }
        : { published: true, reasons: [] };
}

/*
 * The output name is claimed, not written to. ln creates the directory entry
 * in one step and fails if the name is already there -- measured, including
 * that the file already at that name is left exactly as it was -- so two runs
 * cannot both believe they published, and nothing can appear under that name
 * half written.
 *
 * Hard links are not supported everywhere: FAT-formatted drives and some
 * network shares refuse them. The fallback is a rename within one directory,
 * which is atomic wherever it works at all.
 */
function claim(app, incoming, finalPath) {
    try {
        runArgv(app, [LN, incoming, finalPath], "claiming the output name");

        return { published: true, reasons: [] };
    } catch (error) {
        return renameOnto(app, incoming, finalPath, errorMessage(error));
    }
}

function deliver(app, stagedPath, incoming, finalPath) {
    const staging = stageBeside(
        app,
        stagedPath,
        incoming,
        fileSize(app, stagedPath)
    );

    return staging.published ? claim(app, incoming, finalPath) : staging;
}

module.exports = { fileSize, stagingPath, stageBeside, claim, deliver };
