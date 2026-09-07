"use strict";

const { CP, MV, STAT } = require("../core/executables.js");
const { errorMessage } = require("../core/errors.js");
const { runArgv, fileExists } = require("./shell.js");

/*
 * Getting the bytes from the workspace to the output folder.
 *
 * Where the PDF is built matters as much as how it is moved, and both were
 * settled by measurement inside a Shortcuts helper. pdfcpu created the file in
 * the user's Downloads folder; afterwards /bin/mv could not rename it and
 * /bin/cp could not even read it, both refused with "Operation not permitted".
 * In the same folder, on the same run, a file the shell itself created could
 * be renamed freely, and copying in from the workspace was allowed. Whatever
 * the sandbox is doing, it is doing it to the file pdfcpu wrote there -- so
 * nothing is written there any more except the finished PDF.
 *
 * A rename is still preferred. The workspace and the output folder are
 * normally the same volume, where a rename is atomic and nothing can read a
 * half-written PDF under the final name. The copy is the fallback for when the
 * rename is refused, or when the images live on another volume; because a copy
 * is not atomic it is verified by comparing sizes rather than by the
 * destination merely existing. That is what tells a finished copy from a
 * truncated one, and from `cp -n` silently declining because something else
 * took the name -- neither mv -n nor cp -n reports declining, both exit zero.
 *
 * Who owns the PDF while this is going on is publish.js.
 */

const SIZE_UNKNOWN = -1;

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
 * mv -n exits zero when it declines, so the partial surviving is the only
 * evidence that nothing moved.
 */
function renameInto(app, from, to) {
    try {
        runArgv(app, [MV, "-n", from, to], "publishing PDF");
    } catch (error) {
        return { published: false, reason: errorMessage(error) };
    }

    return fileExists(app, from)
        ? { published: false, reason: "the rename declined: the output path was taken" }
        : { published: true };
}

function copyInto(app, from, to) {
    try {
        runArgv(app, [CP, "-n", from, to], "copying the PDF into place");
    } catch (error) {
        return { published: false, reason: errorMessage(error) };
    }

    const expected = fileSize(app, from);
    const written = fileSize(app, to);

    if (expected === SIZE_UNKNOWN || written !== expected) {
        return {
            published: false,
            reason: `the published file is ${written} bytes where ` +
                `${expected} were expected`
        };
    }

    return { published: true };
}

/*
 * A rename first, a copy when the host refuses it.
 */
function attemptPublication(app, stagedPath, finalPath) {
    const attempts = [renameInto(app, stagedPath, finalPath)];

    if (!attempts[0].published) {
        attempts.push(copyInto(app, stagedPath, finalPath));
    }

    return attempts;
}

module.exports = { fileSize, renameInto, copyInto, attemptPublication };
