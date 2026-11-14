"use strict";
const { IssueError, OperationError, errorMessage } = require("../core/errors.js");
const { dirname } = require("../core/paths.js");

function originalObservation(publication, staged) {
    try { return publication.facts(staged); }
    catch (error) { return { error: errorMessage(error) }; }
}

function requireOriginal(publication, { staged, expected, cause, candidate = null }) {
    const observed = originalObservation(publication, staged);
    if (expected.identity && expected.size > 0 && observed.identity === expected.identity && observed.size === expected.size) { return; }
    const message = "The original PDF could not be verified; no trustworthy recovery path is available.";
    throw new IssueError(message, { cause, recovery: null, issues: [{ code: "fault", stage: "publication", message,
        diagnostic: { path: staged, expected, observed, ...(candidate ? { candidate } : {}) } }] });
}

/** Keep the verified private original if a public claim's stored name cannot be confirmed. */
function actualPublicationPath(publication, { staged, original, path, claimed }) {
    try { return publication.actualPath(path, claimed); }
    catch (error) {
        if (!(error instanceof OperationError)) { throw error; }
        let originalFailure = null;
        try { requireOriginal(publication, { staged, expected: original, cause: error }); }
        catch (failure) { originalFailure = failure; }
        const message = `A PDF was claimed in the destination folder, but its stored filename could not be verified. ${originalFailure ? "The original PDF could not be verified either; no trustworthy recovery path is available." : "The validated original was retained."}`;
        throw new IssueError(message, { cause: originalFailure ?? error, recovery: originalFailure ? null : staged,
            issues: [{ code: originalFailure ? "fault" : "publication", stage: "publication", message,
                diagnostic: { message: errorMessage(error), folder: dirname(path), claimedIdentity: claimed.identity, claimedSize: claimed.size,
                    ...(originalFailure ? originalFailure.issues[0].diagnostic : {}) } }] });
    }
}
module.exports = { actualPublicationPath, requireOriginal };
