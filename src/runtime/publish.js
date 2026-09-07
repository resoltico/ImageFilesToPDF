"use strict";

const { setAside } = require("./rescue.js");
const { errorMessage } = require("../core/errors.js");
const { attemptPublication } = require("./transfer.js");
const { fileExists, verifyFileWritten, removeFile } = require("./shell.js");

/*
 * Who owns a finished PDF, and where it goes when it cannot be published.
 *
 * The bytes are transfer.js's business. This is the rule about the file: the
 * job owns a validated PDF until it is somewhere else, and the workspace it
 * was built in cannot be removed while it is still in there.
 */

function describeFailure(reasons, recovered) {
    return [
        "The PDF could not be published without overwriting another file.",
        ...reasons,
        `The finished PDF has been kept here:\n\n${recovered}`
    ].join("\n\n");
}

/*
 * Every way publication can fail ends here, so a validated PDF is put
 * somewhere it will survive and the message says where.
 *
 * The job owns it until then. The workspace is removed when the run ends, and
 * the guard against that is this set: a staged file leaves it only once the
 * file is somewhere else -- published, or set aside outside the workspace.
 * Setting aside is best effort, so when it fails the file stays where it was
 * and the workspace has to stay with it.
 */
function keep(job, stagedPath, reasons) {
    const recovered = setAside(job.app, stagedPath);

    if (recovered !== stagedPath) {
        job.unpublished.delete(stagedPath);
    }

    return new Error(describeFailure(reasons, recovered));
}

/*
 * The PDF is where it was meant to go, so the job stops owning the staged
 * copy and the copy goes. Removing it is a no-op after a rename; after a copy
 * it clears the source, best effort, because a host that refused the rename
 * may refuse this too and the user has their PDF either way.
 */
function confirm(job, stagedPath, finalPath) {
    try {
        verifyFileWritten(job.app, finalPath, "output PDF");
    } catch (error) {
        throw keep(job, stagedPath, [errorMessage(error)]);
    }

    job.unpublished.delete(stagedPath);
    removeFile(job.app, stagedPath);
}

function publishPdf(job, stagedPath, finalPath) {
    const { app } = job;

    job.progress.phase("Saving PDF");
    job.unpublished.add(stagedPath);

    if (fileExists(app, finalPath)) {
        throw keep(job, stagedPath, [
            `The output path became occupied before publication:\n\n${finalPath}`
        ]);
    }

    const attempts = attemptPublication(app, stagedPath, finalPath);

    if (!attempts.at(-1).published) {
        throw keep(job, stagedPath, attempts.map((attempt) => attempt.reason));
    }

    confirm(job, stagedPath, finalPath);
}

module.exports = { publishPdf };
