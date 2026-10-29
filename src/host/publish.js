"use strict";
const { requireValidatedArtifact } = require("../core/artifacts.js");
const { OperationError } = require("../core/errors.js");
const { stagingArea } = require("./staging-area.js");
const { copyBeside } = require("./output-copy.js");
const { keep } = require("./recovery.js");
const { confirm, isPublished } = require("./settling.js");
const { ISSUE, issuesOf } = require("../core/outcomes.js");
const { errorMessage, isUserCancelled } = require("../core/errors.js");
const { collisionPath, MAXIMUM_SUFFIX } = require("../core/naming.js");

const needsStaging = (state) => ["cross-device", "unsupported"].includes(state);

function destinationCopy(context) {
    const { job, paths, facts } = context;
    const area = stagingArea(paths.final);
    const copied = copyBeside(job, paths.staged, area, facts.size);
    context.area = copied.area;
    if (copied.state !== "copied") { throw copied.error; }
    Object.assign(context, { from: area.file, claimed: { identity: copied.identity, size: facts.size } });
}

function claim(context) {
    const { job, paths } = context;
    let outcome = job.publication.link(context.from, paths.final);
    if (needsStaging(outcome.state)) {
        if (!context.area) {
            destinationCopy(context);
            outcome = job.publication.link(context.from, paths.final);
        }
        if (needsStaging(outcome.state)) { outcome = job.publication.rename(context.from, paths.final); }
    }
    context.diagnostic = { ...outcome.diagnostic, state: outcome.state };
    return outcome;
}

function confirmed(context) {
    const { job, paths, claimed, area } = context;
    const issueStart = job.cleanupIssues.length;
    const outcome = { state: "unconfirmed", claimedIdentity: claimed.identity, claimedSize: claimed.size, staging: area };
    try {
        // No checkpoint between confirmation and recording the confirmed destination.
        confirm(job, paths, outcome);
        return { state: "saved", path: paths.final, issues: job.cleanupIssues.slice(issueStart) };
    } catch (error) {
        if (outcome.state !== "confirmed") { throw error; }
        return { state: "saved", path: paths.final, issues: issuesOf(error, "cleanup") };
    }
}

function claimAvailable(context, destination) {
    for (let attempt = 1; attempt < MAXIMUM_SUFFIX; attempt += 1) {
        context.job.progress.phase("Saving PDF");
        context.paths.final = collisionPath(destination, attempt);
        const outcome = claim(context);
        if (outcome.state === "created") { return confirmed(context); }
        if (outcome.state !== "exists") { throw new OperationError(`Publication ${outcome.state}: ${JSON.stringify(context.diagnostic)}`); }
    }
    throw new OperationError("Could not create a unique output filename.");
}

function publicationCode(error) {
    const [issue] = issuesOf(error, "publication");
    return issue.code === ISSUE.operation ? ISSUE.publication : issue.code;
}

function failedPublication(context, error) {
    const { job, paths, claimed, area } = context;
    if (isUserCancelled(error) && isPublished(job.publication.facts(paths.final), {
        claimedIdentity: claimed.identity, claimedSize: claimed.size
    })) {
        const saved = confirmed(context);
        job.progress.requestStop();
        return saved;
    }
    if (error?.recovery) { throw error; }
    const failure = keep(job, paths, { reasons: [errorMessage(error)], staging: area });
    failure.issues = [{ code: publicationCode(error), stage: "publication",
        message: "The PDF could not be saved to its requested destination.", diagnostic: context.diagnostic ?? issuesOf(error, "publication")[0].diagnostic }, ...failure.issues.slice(1)];
    throw failure;
}

/** Exact native claims retry positively classified collisions using the same validated PDF. */
function publishPdf(job, staged, destination) {
    requireValidatedArtifact(job.artifacts, staged);
    const facts = job.publication.facts(staged);
    const paths = { staged, final: destination };
    if (!facts.identity || facts.size <= 0) {
        throw keep(job, paths, { reasons: ["The validated PDF identity could not be measured."], staging: null });
    }
    const context = { job, paths, facts, area: null, from: staged, claimed: facts, diagnostic: null };
    try { return claimAvailable(context, destination); }
    catch (error) { return failedPublication(context, error); }
}
module.exports = { publishPdf };
