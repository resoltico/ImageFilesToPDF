"use strict";

const { isPublished } = require("../core/artifacts.js");
const { releaseOwnedArtifact } = require("./workspace.js");
const { ISSUE, issuesOf } = require("../core/outcomes.js");
const { keep, clearAway } = require("./recovery.js");
const { removeOwned } = require("./owned-cleanup.js");

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

/*
 * Letting go of both copies, in this order: the drop decides whether runJob
 * keeps the workspace, so it comes before the copy it was protecting goes.
 * One of these rather than two, because an abandoned publication that turns
 * out to have published needs exactly the same.
 */
function settled(job, paths, outcome) {
    releaseOwnedArtifact(job, paths.staged);
    job.cleanupIssues.push(...clearAway(job.app, outcome));
    removeOwned(job, paths.staged);
    if (job.cleanupIssues.some((issue) => issue.code === ISSUE.cancelled)) { job.progress.requestStop(); }
}

function confirm(job, paths, outcome) {
    const published = job.publication.facts(paths.final);

    if (!isPublished(published, outcome)) {
        throw keep(job, paths, {
            ...outcome,
            reasons: [
                `the output path does not hold the PDF this run published:\n\n${paths.final}`
            ]
        });
    }

    outcome.state = "confirmed";
    try { settled(job, paths, outcome); }
    catch (error) { job.cleanupIssues.push(...issuesOf(error, "cleanup")); }
}

module.exports = { confirm };
