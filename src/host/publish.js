"use strict";
const { requireOriginal } = require("./publication-name.js");
const { requireValidatedArtifact, isPublished } = require("../core/artifacts.js");
const { keep } = require("./recovery.js");
const { confirm } = require("./settling.js");
const { ISSUE, issuesOf } = require("../core/outcomes.js");
const { IssueError, errorMessage, isUserCanceled } = require("../core/errors.js");
const { claimAvailable } = require("./destination.js");

function confirmed(context) {
    const { job, paths, claimed, area } = context;
    const issueStart = job.cleanupIssues.length;
    const outcome = { state: "unconfirmed", original: context.facts, claimedIdentity: claimed.identity, claimedSize: claimed.size, staging: area };
    try {
        // No checkpoint between confirmation and recording the confirmed destination.
        confirm(job, paths, outcome);
        return { state: "saved", path: paths.final, issues: job.cleanupIssues.slice(issueStart) };
    } catch (error) {
        if (outcome.state !== "confirmed") { throw error; }
        return { state: "saved", path: paths.final, issues: issuesOf(error, "cleanup") };
    }
}

function publicationCode(error) {
    const [issue] = issuesOf(error, "publication");
    return issue.code === ISSUE.operation ? ISSUE.publication : issue.code;
}

function publicationDiagnostic(context, error) {
    const diagnostic = context.diagnostic ?? issuesOf(error, "publication")[0].diagnostic;
    const message = typeof diagnostic?.message === "string" && diagnostic.message.trim() ? diagnostic.message : errorMessage(error);
    return { ...diagnostic, message };
}

function failedPublication(context, error) {
    const { job, paths, claimed, area } = context;
    if (error && Object.hasOwn(error, "recovery")) { throw error; }
    if (isUserCanceled(error) && isPublished(job.publication.facts(paths.final), {
        claimedIdentity: claimed.identity, claimedSize: claimed.size
    })) {
        const saved = confirmed(context);
        job.progress.requestStop();
        return saved;
    }
    requireOriginal(job.publication, { staged: paths.staged, expected: context.facts, cause: error, candidate: area ? { folder: area.directory } : null });
    const failure = keep(job, paths, { reasons: [errorMessage(error)], staging: area });
    const issues = [{ code: publicationCode(error), stage: "publication",
        message: "The PDF could not be saved to its requested destination.", diagnostic: publicationDiagnostic(context, error) }, ...failure.issues.slice(1)];
    throw new IssueError(failure.message, { cause: failure, recovery: failure.recovery, issues });
}

function originalFacts(publication, staged) {
    try { return publication.facts(staged); }
    catch (error) { return requireOriginal(publication, { staged, expected: { identity: "", size: -1 }, cause: error }); }
}

/** Exact native claims retry positively classified collisions using the same validated PDF. */
function publishPdf(job, staged, destination) {
    requireValidatedArtifact(job.artifacts, staged);
    const facts = originalFacts(job.publication, staged);
    const paths = { staged, final: destination, intended: destination, original: facts };
    if (!facts.identity || facts.size <= 0) {
        throw keep(job, paths, { reasons: ["The validated PDF identity could not be measured."], staging: null });
    }
    const context = { job, paths, facts, area: null, from: staged, claimed: facts, diagnostic: null };
    try { return claimAvailable(context, destination, confirmed, () => job.progress.phase("Saving PDF")); }
    catch (error) { return failedPublication(context, error); }
}
module.exports = { publishPdf };
