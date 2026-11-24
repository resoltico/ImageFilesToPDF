"use strict";
const { message, publicationFailureDetails } = require("../core/messages.js");

const { actualPublicationPath, requireOriginal, unconfirmedClaim } = require("./publication-name.js");
const { releaseOwnedArtifact } = require("./workspace.js");
const { ISSUE, issuesOf } = require("../core/outcomes.js");
const { IssueError, diagnosticText } = require("../core/errors.js");
const { basename } = require("../core/paths.js");
const { isPublished, recoveryDestination } = require("../core/artifacts.js");
const { claimAvailable } = require("./destination.js");

/*
 * What this attempt made and does not need: the place it made in the output
 * folder, and -- when a folder was standing at the output path, which ln
 * links into rather than refusing -- the link left inside it, which publish.js
 * adds once it has confirmed the file there is the one this run published.
 */
function clearAway(operations, outcome) {
    return outcome.staging ? operations.closeStaging( outcome.staging) : [];
}

/*
 * Every way publication can fail ends here. The finished PDF is in the
 * workspace, where it was built and where it has stayed, so it is put
 * somewhere that will outlive the run and the message says where.
 *
 * Setting aside is best effort: when it fails the file stays where it was,
 * and the workspace has to stay with it. The artifact lifecycle retains it
 * until the PDF is confirmed somewhere else.
 */
function releaseRecoveredArtifact(job, staged, recovered, cleanup) {
    if (recovered !== staged) {
        try { releaseOwnedArtifact(job, staged); }
        catch (error) { cleanup.push(...issuesOf(error, "cleanup")); }
    }
}

function confirmedDownloads(context) {
    const { job, paths, claimed, area } = context;
    if (!isPublished(job.publication.facts(paths.final), { claimedIdentity: claimed.identity, claimedSize: claimed.size })) {
        throw unconfirmedClaim(job.publication, { staged: paths.staged, original: context.facts, path: paths.final, claimed });
    }
    paths.final = actualPublicationPath(job.publication, { staged: paths.staged, original: context.facts, path: paths.final, claimed });
    const cleanup = area ? job.operations.closeStaging(area) : [];
    requireOriginal(job.publication, { staged: paths.staged, expected: context.facts, cause: null,
        candidate: { path: paths.final, identity: claimed.identity, size: claimed.size } });
    const removed = job.operations.removeFile(paths.staged);
    return { state: "recovered", path: paths.final, issues: [...cleanup, ...(removed.state === "failed" ? [removed.issue] : [])] };
}

async function downloadsRecovery(job, paths) {
    let context = null;
    try {
        requireOriginal(job.publication, { staged: paths.staged, expected: paths.original, cause: null });
        const facts = paths.original;
        const target = recoveryDestination(job.storage.downloads, paths.intended, paths.staged);
        if (target.kind === "workspace") { return { state: "retained", path: target.path, issues: [] }; }
        const destination = target.path;
        context = { job, paths: { staged: paths.staged, final: destination, original: paths.original }, facts, from: paths.staged, claimed: facts, area: null, diagnostic: null };
        return await claimAvailable(context, destination, confirmedDownloads, () => undefined);
    } catch (error) {
        if (error && Object.hasOwn(error, "recovery")) { throw error; }
        requireOriginal(job.publication, { staged: paths.staged, expected: paths.original, cause: error, candidate: context?.area ? { folder: context.area.directory } : null });
        const cleanup = context?.area ? job.operations.closeStaging(context.area) : [];
        const [issue] = issuesOf(error, "recovery");
        return { state: "retained", path: paths.staged, issues: [{ code: issue.code === ISSUE.operation ? ISSUE.recovery : issue.code, stage: "recovery", params: {},
            message: message("downloadsRecoveryFailed"), diagnostic: { message: diagnosticText(error), path: context?.paths.final, detail: context?.diagnostic } }, ...cleanup] };
    }
}

async function keep(job, paths, outcome) {
    if (typeof paths.intended !== "string") { throw new Error("Publication intent is required for recovery."); }
    requireOriginal(job.publication, { staged: paths.staged, expected: paths.original, cause: null });
    const cleanup = clearAway(job.operations, outcome);

    const downloads = await downloadsRecovery(job, paths);
    const rescue = downloads.state === "recovered" ? downloads : job.operations.setAside( paths.staged, job.publication, { intendedName: basename(paths.intended), original: paths.original });
    const recovered = rescue.path;
    if (recovered === paths.staged) { requireOriginal(job.publication, { staged: paths.staged, expected: paths.original, cause: null }); }

    releaseRecoveredArtifact(job, paths.staged, recovered, cleanup);

    const failure = new IssueError(publicationFailureDetails(outcome.reasons, recovered), { recovery: recovered, issues: [{ code: ISSUE.publication, stage: "publication", params: {}, message: message("publicationDestinationFailed"), diagnostic: outcome.reasons }, ...cleanup, ...rescue.issues, ...(downloads.state === "recovered" ? [] : downloads.issues)] });
    return failure;
}

module.exports = { keep, clearAway };
