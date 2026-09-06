"use strict";

const { CP, MV, STAT } = require("../core/executables.js");
const { errorMessage } = require("../core/errors.js");
const {
    runArgv,
    fileExists,
    verifyFileWritten,
    removeFile
} = require("./shell.js");

/*
 * Getting a finished PDF out of the workspace and into the output folder.
 *
 * Where the PDF is built matters as much as how it is published, and both
 * were settled by measurement inside a Shortcuts helper. pdfcpu created the
 * file in the user's Downloads folder; afterwards /bin/mv could not rename it
 * and /bin/cp could not even read it, both refused with "Operation not
 * permitted". In the same folder, on the same run, a file the shell itself
 * created could be renamed freely, and copying in from the workspace was
 * allowed. Whatever the sandbox is doing, it is doing it to the file pdfcpu
 * wrote there — so nothing is written there any more except the finished PDF.
 *
 * A rename is still preferred. The workspace and the output folder are
 * normally the same volume, where a rename is atomic and nothing can read a
 * half-written PDF under the final name. The copy is the fallback for when
 * the rename is refused, or when the images live on another volume; because a
 * copy is not atomic it is verified by comparing sizes rather than by the
 * destination merely existing. That is what tells a finished copy from a
 * truncated one, and from `cp -n` silently declining because something else
 * took the name — neither mv -n nor cp -n reports declining, both exit zero.
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

function describeFailure(attempts) {
    return [
        "The PDF could not be published without overwriting another file.",
        ...attempts.map((attempt) => attempt.reason)
    ].join("\n\n");
}

function publishPdf(app, stagedPath, finalPath) {
    if (fileExists(app, finalPath)) {
        throw new Error(
            `The output path became occupied before publication:\n\n${finalPath}`
        );
    }

    const attempts = [renameInto(app, stagedPath, finalPath)];

    if (!attempts[0].published) {
        attempts.push(copyInto(app, stagedPath, finalPath));
    }

    if (!attempts.at(-1).published) {
        removeFile(app, stagedPath);

        throw new Error(describeFailure(attempts));
    }

    verifyFileWritten(app, finalPath, "output PDF");

    // A no-op after a rename; after a copy it clears the source. Removal is
    // best effort, because a host that refused the rename may refuse this
    // too, and the user has their PDF either way.
    removeFile(app, stagedPath);
}

module.exports = { fileSize, renameInto, copyInto, publishPdf };
