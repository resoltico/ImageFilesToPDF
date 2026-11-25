"use strict";
const { message } = require("../core/messages.js");

const { actualPublicationPath, requireOriginal, unconfirmedClaim } = require("./publication-name.js");
const { isPublished } = require("../core/artifacts.js");
const { releaseOwnedArtifact } = require("./workspace.js");
const { IssueError } = require("../core/errors.js");
const { ISSUE, issuesOf, failureIssues } = require("../core/outcomes.js");
const { clearAway } = require("./recovery.js");
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
 * Compare the output entry with the identity and size verified by the claim.
 * Hard links preserve identity. A platform can supply a freshly verified
 * identity after a rename changes it.
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
    try {
        requireOriginal(job.publication, { staged: paths.staged, expected: outcome.original, cause: null,
            candidate: { path: paths.final, identity: outcome.claimedIdentity, size: outcome.claimedSize } });
    } catch (error) {
        const wording = message("publicationOriginalRetained");
        throw new IssueError(wording, { cause: error, issues: failureIssues(error).map((issue) => ({ ...issue, stage: "cleanup", params: {}, message: wording })) });
    }
    releaseOwnedArtifact(job, paths.staged);
    job.cleanupIssues.push(...clearAway(job.operations, outcome));
    removeOwned(job, paths.staged);
    if (job.cleanupIssues.some((issue) => issue.code === ISSUE.canceled)) { job.progress.requestStop(); }
}

function confirm(job, paths, outcome) {
    const published = job.publication.facts(paths.final);

    if (!isPublished(published, outcome)) {
        throw unconfirmedClaim(job.publication, { staged: paths.staged, original: outcome.original,
            path: paths.final, claimed: { identity: outcome.claimedIdentity, size: outcome.claimedSize } });
    }

    paths.final = actualPublicationPath(job.publication, { staged: paths.staged, original: outcome.original, path: paths.final, claimed: { identity: outcome.claimedIdentity, size: outcome.claimedSize } });
    outcome.state = "confirmed";
    try { settled(job, paths, outcome); }
    catch (error) { job.cleanupIssues.push(...issuesOf(error, "cleanup")); }
}

module.exports = { confirm };
