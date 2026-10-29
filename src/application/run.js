"use strict";
const { selectionContext } = require("../core/selection-policy.js");
const { runOutcome, issuesOf } = require("../core/outcomes.js");

function presentOutcome(ports, outcome) {
    try {
        Object.assign(outcome, runOutcome(outcome.documents, outcome.rejected, outcome.issues, ports.progress.diagnostics));
        ports.progress.close();
        return ports.present(outcome);
    }
    catch (cause) {
        const [issue] = issuesOf(cause, "reporting");
        const error = new Error(issue.message, { cause });
        error.outcome = outcome;
        error.stack = issue.diagnostic?.stack ?? error.stack;
        throw error;
    }
}

function settingsForRequest(ports, request) {
    if (request.invocation.headless) { return request.invocation.settings; }
    const context = { ...selectionContext(request.selection), diagnostics: ports.progress.diagnostics };
    if (context.rejected.length > 0) { ports.review(context); }
    return ports.settings(context);
}

/** The use case owns ordering and consent boundaries; ports adapt the host and presentation. */
function executeRun(ports) {
    const request = ports.prepare();
    const { images, rejected } = request.selection;
    if (images.length === 0) { return ports.noImages(rejected); }
    ports.progress.pause();
    const job = ports.createJob(request, settingsForRequest(ports, request));
    const result = ports.convert(job, images);
    result.rejected = rejected;
    return presentOutcome(ports, result);
}
module.exports = { executeRun };
