"use strict";
const { message } = require("../core/messages.js");
const { IssueError, errorMessage } = require("../core/errors.js");
const { ISSUE, issuesOf } = require("../core/outcomes.js");
const { dirname } = require("../core/paths.js");

function originalObservation(publication, staged) {
    try { return publication.facts(staged); }
    catch (error) { return { error: errorMessage(error) }; }
}

function requireOriginal(publication, { staged, expected, cause, candidate = null }) {
    const observed = originalObservation(publication, staged);
    if (expected.identity && expected.size > 0 && observed.identity === expected.identity && observed.size === expected.size) { return; }
    const wording = message("publicationOriginalUnknown");
    throw new IssueError(wording, { cause, recovery: null, issues: [{ code: "fault", stage: "publication", params: {}, message: wording,
        diagnostic: { path: staged, expected, observed, ...(candidate ? { candidate } : {}) } }] });
}

function unconfirmedClaim(publication, { staged, original, path, claimed, diagnostic = null }) {
    const wording = message("publicationClaimUnverified");
    try { requireOriginal(publication, { staged, expected: original, cause: null, candidate: { path, ...claimed } }); }
    catch (error) { return error; }
    return new IssueError(wording, { recovery: staged, issues: [{ code: ISSUE.publication, stage: "publication", params: {}, message: wording,
        diagnostic: { path, claimed, detail: diagnostic } }] });
}

/** Keep the verified private original if a public claim's stored name cannot be confirmed. */
function actualPublicationPath(publication, { staged, original, path, claimed }) {
    try { return publication.actualPath(path, claimed); }
    catch (error) {
        let originalFailure = null;
        try { requireOriginal(publication, { staged, expected: original, cause: error }); }
        catch (failure) { originalFailure = failure; }
        const underlying = issuesOf(error, "publication");
        const primary = underlying.findIndex((issue) => issue.code !== ISSUE.cleanup);
        const code = originalFailure ? ISSUE.fault : underlying[primary]?.code ?? ISSUE.publication;
        const stack = underlying[primary]?.diagnostic?.stack;
        const wording = message(originalFailure ? "publicationNameAndOriginalUnverified" : "publicationNameUnverifiedAndOriginalKept");
        throw new IssueError(wording, { cause: originalFailure ?? error, recovery: originalFailure ? null : staged, stack: error?.stack,
            issues: [{ code: code === ISSUE.operation ? ISSUE.publication : code, stage: "publication", params: {}, message: wording,
                diagnostic: { ...(stack ? { stack } : {}), message: `${wording} ${errorMessage(error)}`, folder: dirname(path), claimedIdentity: claimed.identity, claimedSize: claimed.size,
                    ...(originalFailure ? originalFailure.issues[0].diagnostic : {}) } }, ...underlying.filter((unused, index) => index !== primary)] });
    }
}
module.exports = { actualPublicationPath, requireOriginal, unconfirmedClaim };
