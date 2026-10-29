"use strict";

const { releaseArtifact } = require("../core/artifacts.js");
const { ISSUE, issuesOf } = require("../core/outcomes.js");
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
        try { releaseArtifact(job.artifacts, staged); }
        catch (error) { cleanup.push(...issuesOf(error, "cleanup")); }
    }
}

function keep(job, paths, outcome) {
    const cleanup = clearAway(job.app, outcome);

    const rescue = setAside(job.app, paths.staged, job.publication.facts);
    const recovered = rescue.path;

    releaseRecoveredArtifact(job, paths.staged, recovered, cleanup);

    const failure = new Error(describeFailure(
        outcome.reasons,
        `The finished PDF has been kept here:\n\n${recovered}`
    ));
    failure.recovery = recovered;
    failure.issues = [{ code: ISSUE.publication, stage: "publication", message: "The PDF could not be saved to its requested destination.", diagnostic: outcome.reasons }, ...cleanup, ...rescue.issues];
    return failure;
}

module.exports = { keep, clearAway };
