"use strict";
const { IssueError } = require("../core/errors.js");
const { selectionContext } = require("../core/selection-policy.js");
const { runOutcome, issuesOf } = require("../core/outcomes.js");

function presentOutcome(ports, outcome) {
    try {
        Object.assign(outcome, runOutcome(outcome.documents, outcome.rejected, outcome.issues, ports.progress.diagnostics));
        ports.progress.close();
        return ports.interaction.present(outcome);
    }
    catch (cause) {
        const [issue] = issuesOf(cause, "reporting");
        const error = new IssueError(issue.message, { cause, outcome, stack: issue.diagnostic?.stack });
        throw error;
    }
}

/** The use case owns ordering and consent boundaries; ports adapt the host and presentation. */
function executeRun(ports) {
    const request = ports.prepare();
    const { images, rejected } = request.selection;
    if (images.length === 0) { return ports.interaction.noImages(rejected); }
    ports.progress.pause();
    const context = { ...selectionContext(request.selection), diagnostics: ports.progress.diagnostics };
    const job = ports.createJob(request, ports.interaction.settings(context, request));
    const result = ports.convert(job, images);
    result.rejected = rejected;
    return presentOutcome(ports, result);
}
module.exports = { executeRun };
