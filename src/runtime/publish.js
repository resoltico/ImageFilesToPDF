"use strict";

const { setAside } = require("./rescue.js");
const { basename } = require("../core/paths.js");
const { errorMessage } = require("../core/errors.js");
const { deliver } = require("./transfer.js");
const { stagingPath } = require("./output-copy.js");
const { pathIsTaken, verifyFileWritten, removeFile } = require("./shell.js");

/*
 * Who owns a finished PDF, and where it goes when it cannot be published.
 *
 * The bytes are transfer.js's business. This is the rule about the file, and
 * it is one rule: the job owns the PDF it built until the output path has
 * been checked, and this run removes only what this run made.
 *
 * Both halves were learned the hard way. The workspace copy used to be moved
 * into the output folder, so a failure after that had to work out where the
 * bytes had got to -- and it worked it out by asking whether files existed,
 * through a check that answers "no" when it cannot tell. A refused check
 * therefore deleted the finished PDF and reported it missing. Nothing is
 * moved out of the workspace any more, and nothing is removed on the strength
 * of a question about a file this run did not create.
 */

function describeFailure(reasons, whereabouts) {
    return [
        "The PDF could not be published without overwriting another file.",
        ...reasons,
        whereabouts
    ].join("\n\n");
}

/*
 * What this attempt left in the output folder: the staging copy, if it got as
 * far as making one, and the link a claim leaves inside a folder that is
 * standing at the output path -- ln puts it in there rather than refusing.
 * Both are this run's own, which is what makes removing them safe, and a
 * staging copy this run did not make is not one of them.
 *
 * Nothing is asked about either unless this attempt made it: an ordinary
 * publication, which is a link and nothing else, never names a staging file
 * at all.
 */
function clearAway(job, paths, outcome) {
    if (outcome.staged) {
        removeFile(job.app, paths.incoming);
    }

    if (outcome.claimed) {
        // Where a claim goes when a folder is standing at the output path.
        removeFile(job.app, `${paths.final}/${basename(outcome.claimed)}`);
    }
}

/*
 * Every way publication can fail ends here. The finished PDF is in the
 * workspace, where it was built and where it has stayed, so it is put
 * somewhere that will outlive the run and the message says where.
 *
 * Setting aside is best effort: when it fails the file stays where it was,
 * and the workspace has to stay with it. That is what the unpublished set
 * decides, so it is cleared only when the PDF is somewhere else.
 */
function keep(job, paths, outcome) {
    clearAway(job, paths, outcome);

    const recovered = setAside(job.app, paths.staged);

    if (recovered !== paths.staged) {
        job.unpublished.delete(paths.staged);
    }

    return new Error(describeFailure(
        outcome.reasons,
        `The finished PDF has been kept here:\n\n${recovered}`
    ));
}

/*
 * The PDF is at the output path, or it is not published. Checked before
 * anything is let go: after this the staging copy and the workspace copy both
 * go, and a failed check has to still have a finished PDF to give back.
 */
function confirm(job, paths, outcome) {
    try {
        verifyFileWritten(job.app, paths.final, "output PDF");
    } catch (error) {
        throw keep(job, paths, { ...outcome, reasons: [errorMessage(error)] });
    }

    job.unpublished.delete(paths.staged);
    job.progress.finished("Saved");
    clearAway(job, paths, outcome);
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

    if (pathIsTaken(app, finalPath)) {
        throw keep(job, paths, {
            reasons: [`The output path became occupied before publication:\n\n${finalPath}`]
        });
    }

    const outcome = deliver(app, paths);

    if (!outcome.published) {
        throw keep(job, paths, outcome);
    }

    confirm(job, paths, outcome);
}

module.exports = { publishPdf };
