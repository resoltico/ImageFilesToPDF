"use strict";
const { requireOriginal, unconfirmedClaim } = require("./publication-name.js");
const { requireValidatedArtifact, isPublished } = require("../core/artifacts.js");
const { keep } = require("./recovery.js");
const { confirm } = require("./settling.js");
const { issueMessage, message } = require("../core/messages.js");
const { ISSUE, issuesOf, failureIssues } = require("../core/outcomes.js");
const { IssueError, diagnosticText, isUserCanceled } = require("../core/errors.js");
const { claimAvailable } = require("./destination.js");

function confirmed(context) {
    const { job, paths, claimed, area } = context;
    const issueStart = job.cleanupIssues.length;
    // confirm() marks the outcome confirmed once the destination is verified.
    const outcome = { original: context.facts, claimedIdentity: claimed.identity, claimedSize: claimed.size, staging: area };
    try {
        // No checkpoint between confirmation and recording the confirmed destination.
        confirm(job, paths, outcome);
        return { state: "saved", path: paths.final, issues: job.cleanupIssues.slice(issueStart) };
    } catch (error) {
        if (Object.hasOwn(error, "recovery")) { throw error; }
        if (outcome.state !== "confirmed") {
            throw unconfirmedClaim(job.publication, { staged: paths.staged, original: context.facts,
                path: paths.final, claimed, diagnostic: diagnosticText(error) });
        }
        return { state: "saved", path: paths.final, issues: issuesOf(error, "cleanup") };
    }
}

function publicationCode(error) {
    const [issue] = failureIssues(error);
    return issue.code === ISSUE.operation ? ISSUE.publication : issue.code;
}

function publicationDiagnostic(context, error) {
    const diagnostic = context.diagnostic ?? failureIssues(error)[0].diagnostic;
    const detail = typeof diagnostic?.message === "string" && diagnostic.message.trim() ? diagnostic.message : diagnosticText(error);
    return { ...diagnostic, message: detail };
}

async function failedPublication(context, error) {
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
    const failure = await keep(job, paths, { reasons: [diagnosticText(error)], staging: area });
    const issues = [{ ...issueMessage(publicationCode(error), "publication", "publicationDestinationFailed"),
        diagnostic: publicationDiagnostic(context, error) }, ...failure.issues.slice(1)];
    throw new IssueError(failure.message, { cause: failure, recovery: failure.recovery, issues });
}

function originalFacts(publication, staged) {
    try { return publication.facts(staged); }
    catch (error) { return requireOriginal(publication, { staged, expected: null, cause: error }); }
}

/** Exact native claims retry positively classified collisions using the same validated PDF. */
async function publishPdf(job, staged, destination) {
    requireValidatedArtifact(job.artifacts, staged);
    const facts = originalFacts(job.publication, staged);
    const paths = { staged, final: destination, intended: destination, original: facts };
    if (!facts.identity || facts.size <= 0) {
        return requireOriginal(job.publication, { staged, expected: facts, cause: null });
    }
    const context = { job, paths, facts, area: null, from: staged, claimed: facts, diagnostic: null };
    try { return await claimAvailable(context, destination, confirmed, () => job.progress.phase(message("progressSavingPdf"))); }
    catch (error) { return failedPublication(context, error); }
}
module.exports = { publishPdf };
