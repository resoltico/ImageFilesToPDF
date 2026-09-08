"use strict";

const { basename } = require("../core/paths.js");
const { keep, clearAway } = require("./recovery.js");
const { deliver, stagingArea } = require("./transfer.js");
const { fileFacts } = require("./file-facts.js");
const { pathIsTaken, removeFile } = require("./shell.js");

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

/*
 * The PDF is at the output path, or it is not published.
 *
 * Asked of the output path itself: which file is this? A hard link shares its
 * volume and file number with the file it was made from, and a rename carries
 * them along, so the same pair is proof that the entry holds what this run
 * put there. A nonempty regular file is not proof of anything -- another
 * writer's PDF is one too, and taking it as ours published their document and
 * deleted both copies of ours.
 *
 * Checked before anything is let go: after this the staging copy and the
 * workspace copy both go, and a failed check has to still have a finished PDF
 * to give back. An identity that could not be read is not a match, which is
 * what makes a refused inspection safe.
 */
function isPublished(published, outcome) {
    return Boolean(published.identity) &&
        published.identity === outcome.claimedIdentity &&
        published.size === outcome.claimedSize;
}

/*
 * ln links into a folder standing at the output path rather than refusing it,
 * so the claim may have gone inside one. The link there is this run's own
 * only if it is the file this run published, which is a question with an
 * exact answer -- and only then is it this run's to remove.
 */
function strayInside(app, paths, outcome) {
    const inside = `${paths.final}/${basename(outcome.claimed)}`;

    return fileFacts(app, inside).identity === outcome.claimedIdentity
        ? [inside]
        : [];
}

function confirm(job, paths, outcome) {
    const published = fileFacts(job.app, paths.final);

    if (!isPublished(published, outcome)) {
        throw keep(job, paths, {
            ...outcome,
            mine: strayInside(job.app, paths, outcome),
            reasons: [
                `the output path does not hold the PDF this run published:\n\n${paths.final}`
            ]
        });
    }

    job.unpublished.delete(paths.staged);
    job.progress.finished("Saved");
    clearAway(job, outcome);
    removeFile(job.app, paths.staged);
}

/*
 * Why not to start: a PDF that cannot be identified cannot be shown to have
 * been published, and a name that is taken is not this run's to take. The
 * check on the name is a courtesy -- the claim is what makes it safe -- but
 * it is a better message than a refused link.
 */
function refuseBefore(app, paths, facts) {
    if (!facts.identity) {
        return `The finished PDF could not be measured:\n\n${paths.staged}`;
    }

    return pathIsTaken(app, paths.final)
        ? `The output path became occupied before publication:\n\n${paths.final}`
        : "";
}

/*
 * What is about to be published is measured first, so that what was published
 * can be told apart from anything else that might be at the name afterwards.
 */
function attempt(job, paths) {
    const facts = fileFacts(job.app, paths.staged);
    const refusal = refuseBefore(job.app, paths, facts);

    if (refusal) {
        throw keep(job, paths, { reasons: [refusal], staging: null });
    }

    const outcome = deliver(job.app, paths, facts);

    if (!outcome.published) {
        throw keep(job, paths, outcome);
    }

    confirm(job, paths, outcome);
}

function publishPdf(job, stagedPath, finalPath) {
    const paths = {
        staged: stagedPath,
        area: stagingArea(finalPath),
        final: finalPath
    };

    job.progress.phase("Saving PDF");
    job.unpublished.add(stagedPath);
    attempt(job, paths);
}

module.exports = { publishPdf };
