"use strict";

const { basename } = require("../core/paths.js");
const { UserCancelled } = require("../core/errors.js");
const { keep, clearAway } = require("./recovery.js");
const { fileFacts } = require("./file-facts.js");
const { removeFile } = require("./shell.js");

/*
 * What the output path holds, and letting go once that is settled.
 *
 * One question, put to the name itself, and every way an attempt can end
 * comes back to it: which file is this? Nothing here infers from absence, and
 * a measurement that could not be taken is not an answer.
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

/*
 * Letting go of both copies, in this order: the drop decides whether runJob
 * keeps the workspace, so it comes before the copy it was protecting goes.
 * One of these rather than two, because an abandoned publication that turns
 * out to have published needs exactly the same.
 */
function settled(job, paths, outcome) {
    job.unpublished.delete(paths.staged);
    clearAway(job, outcome);
    removeFile(job.app, paths.staged);
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

    settled(job, paths, outcome);
}

/*
 * Stopped before it could be published, or stopped after it was: an
 * interrupted call is not proof that the filesystem did nothing.
 *
 * So the output path is asked the same question a successful claim asks it.
 * If it holds this run's file the PDF was published after all, and is let go
 * of exactly as a confirmed publication is; the caller stops afterwards. If
 * it does not, nothing was published: the staging place goes and the PDF is
 * dropped from the unpublished set, which says there is nothing to recover --
 * the workspace takes it on the way out. That is the difference from a
 * refusal, which keeps it because the person needs it back.
 */
function abandon(job, paths, outcome) {
    if (isPublished(fileFacts(job.app, paths.final), outcome)) {
        settled(job, paths, outcome);

        return true;
    }

    clearAway(job, outcome);
    job.unpublished.delete(paths.staged);

    throw new UserCancelled();
}

module.exports = { isPublished, confirm, abandon };
