"use strict";

const { setAside, whereItIs } = require("./rescue.js");
const { errorMessage } = require("../core/errors.js");
const { stagingPath, deliver } = require("./transfer.js");
const { fileExists, verifyFileWritten, removeFile } = require("./shell.js");

/*
 * Who owns a finished PDF, and where it goes when it cannot be published.
 *
 * The bytes are transfer.js's business. This is the rule about the file: the
 * job owns a validated PDF until it is somewhere else, and the workspace it
 * was built in cannot be removed while it is still in there.
 *
 * Nothing is let go until the output path has been checked. Publication moves
 * the file twice -- into the output folder under a hidden name, then onto the
 * name the user will see -- and the copy under the hidden name is what a
 * failed check still has to give back.
 */

function describeFailure(reasons, whereabouts) {
    return [
        "The PDF could not be published without overwriting another file.",
        ...reasons,
        whereabouts
    ].join("\n\n");
}

/*
 * What to tell someone about a PDF that was not published: where it has been
 * put, where it ended up, or -- when the run cannot find it at all -- where
 * it was aiming.
 */
function statement(job, paths, held) {
    if (!held) {
        return `The finished PDF was last seen on its way here:\n\n${paths.final}`;
    }

    const recovered = setAside(job.app, held);

    if (recovered !== paths.staged) {
        job.unpublished.delete(paths.staged);
    }

    return `The finished PDF has been kept here:\n\n${recovered}`;
}

/*
 * Every way publication can fail ends here, so a validated PDF is put
 * somewhere it will survive and the message says where.
 *
 * The job owns it until then. The workspace is removed when the run ends, and
 * the guard against that is this set: a staged file leaves it once the file
 * is somewhere else -- published, set aside, or moved out of the workspace by
 * publication itself. Setting aside is best effort, so when it fails the file
 * stays where it was and the workspace has to stay with it.
 */
function keep(job, paths, reasons) {
    const held = whereItIs(job.app, paths);

    if (held !== paths.incoming) {
        // A staging file nothing is holding on to. It is this attempt's, and
        // no other name for it exists.
        removeFile(job.app, paths.incoming);
    }

    if (held !== paths.staged) {
        job.unpublished.delete(paths.staged);
    }

    return new Error(describeFailure(reasons, statement(job, paths, held)));
}

/*
 * The PDF is at the output path, or it is not published. Checked before the
 * copies are let go: after this the staging file and the workspace file both
 * go, and a failed check would have nothing left to give back.
 */
function confirm(job, paths) {
    try {
        verifyFileWritten(job.app, paths.final, "output PDF");
    } catch (error) {
        throw keep(job, paths, [errorMessage(error)]);
    }

    job.unpublished.delete(paths.staged);
    job.progress.finished("Saved");
    removeFile(job.app, paths.incoming);
    removeFile(job.app, paths.staged);
}

function publishPdf(job, stagedPath, finalPath) {
    const { app } = job;
    const paths = {
        staged: stagedPath,
        incoming: stagingPath(finalPath),
        final: finalPath
    };

    job.progress.phase("Saving PDF");
    job.unpublished.add(stagedPath);

    if (fileExists(app, finalPath)) {
        throw keep(job, paths, [
            `The output path became occupied before publication:\n\n${finalPath}`
        ]);
    }

    const outcome = deliver(app, stagedPath, paths.incoming, finalPath);

    if (!outcome.published) {
        throw keep(job, paths, outcome.reasons);
    }

    confirm(job, paths);
}

module.exports = { publishPdf };
