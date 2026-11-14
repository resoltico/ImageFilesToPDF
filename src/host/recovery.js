"use strict";

const { actualPublicationPath, requireOriginal } = require("./publication-name.js");
const { releaseOwnedArtifact } = require("./workspace.js");
const { ISSUE, issuesOf } = require("../core/outcomes.js");
const { OperationError, IssueError, errorMessage } = require("../core/errors.js");
const { basename } = require("../core/paths.js");
const { isPublished } = require("../core/artifacts.js");
const { claimAvailable } = require("./destination.js");
const { removeFile } = require("./shell.js");
const { setAside } = require("./rescue.js");
const { closeStaging } = require("./staging-area.js");

function describeFailure(reasons, whereabouts) {
    return [
        "The PDF could not be saved where it was meant to go.",
        ...reasons,
        whereabouts
    ].join("\n\n");
}

/*
 * What this attempt made and does not need: the place it made in the output
 * folder, and -- when a folder was standing at the output path, which ln
 * links into rather than refusing -- the link left inside it, which publish.js
 * adds once it has confirmed the file there is the one this run published.
 */
function clearAway(app, outcome) {
    return outcome.staging ? closeStaging(app, outcome.staging) : [];
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
        throw new OperationError("The Downloads recovery could not be confirmed.");
    }
    paths.final = actualPublicationPath(job.publication, { staged: paths.staged, original: context.facts, path: paths.final, claimed });
    const cleanup = area ? closeStaging(job.app, area) : [];
    requireOriginal(job.publication, { staged: paths.staged, expected: context.facts, cause: null,
        candidate: { path: paths.final, identity: claimed.identity, size: claimed.size } });
    const removed = removeFile(job.app, paths.staged);
    return { state: "recovered", path: paths.final, issues: [...cleanup, ...(removed.state === "failed" ? [removed.issue] : [])] };
}

function downloadsRecovery(job, paths) {
    let context = null;
    try {
        requireOriginal(job.publication, { staged: paths.staged, expected: paths.original, cause: null });
        const facts = paths.original;
        const destination = job.storage.downloads + basename(paths.intended);
        context = { job, paths: { staged: paths.staged, final: destination, original: paths.original }, facts, from: paths.staged, claimed: facts, area: null, diagnostic: null };
        return claimAvailable(context, destination, confirmedDownloads, () => undefined);
    } catch (error) {
        if (error && Object.hasOwn(error, "recovery")) { throw error; }
        requireOriginal(job.publication, { staged: paths.staged, expected: paths.original, cause: error, candidate: context?.area ? { folder: context.area.directory } : null });
        const cleanup = context?.area ? closeStaging(job.app, context.area) : [];
        const [issue] = issuesOf(error, "recovery");
        return { state: "retained", path: paths.staged, issues: [{ code: issue.code === ISSUE.operation ? ISSUE.recovery : issue.code, stage: "recovery",
            message: "The PDF could not be recovered to Downloads.", diagnostic: { message: errorMessage(error), path: context?.paths.final, detail: context?.diagnostic } }, ...cleanup] };
    }
}

function keep(job, paths, outcome) {
    if (typeof paths.intended !== "string") { throw new Error("Publication intent is required for recovery."); }
    requireOriginal(job.publication, { staged: paths.staged, expected: paths.original, cause: null });
    const cleanup = clearAway(job.app, outcome);

    const downloads = downloadsRecovery(job, paths);
    const rescue = downloads.state === "recovered" ? downloads : setAside(job.app, paths.staged, job.publication, { intendedName: basename(paths.intended), original: paths.original });
    const recovered = rescue.path;

    releaseRecoveredArtifact(job, paths.staged, recovered, cleanup);

    const failure = new IssueError(describeFailure(
        outcome.reasons,
        `The finished PDF has been kept here:\n\n${recovered}`
    ), { recovery: recovered, issues: [{ code: ISSUE.publication, stage: "publication", message: "The PDF could not be saved to its requested destination.", diagnostic: outcome.reasons }, ...cleanup, ...rescue.issues, ...(downloads.state === "recovered" ? [] : downloads.issues)] });
    return failure;
}

module.exports = { keep, clearAway };
