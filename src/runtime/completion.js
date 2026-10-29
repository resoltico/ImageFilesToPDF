"use strict";

const { APP_NAME, VERSION } = require("../core/version.js");
const { plural } = require("./formatting.js");

/*
 * What the run says it did once it is over.
 *
 * Every completion says the same things in the same order: what was produced,
 * where it went, what was not converted, and how long it took. Producing files
 * without saying where they are is the one thing this exists to prevent.
 */

function describeRejections(rejected, heading = "Not converted:") {
    return `${heading}\n${rejected.map((entry) => `${entry.path || entry.name}: ${entry.reason}`).join("\n")}`;
}

function completionMessage(result) {
    const saved = result.documents.filter((document) => document.state === "saved");
    const recovered = result.documents.filter((document) => document.state === "recovered");
    const details = result.documents.map((document) => [document.state, ...document.sources,
        document.output ?? document.recovery ?? "", ...document.issues.map((issue) => [issue.source ? `Source: ${issue.source}` : "", issue.message, issue.diagnostic ? JSON.stringify(issue.diagnostic) : ""].filter(Boolean).join("\n"))].filter(Boolean).join("\n"));
    return [
        `${plural(saved.length, "PDF")} saved; ${plural(recovered.length, "PDF")} recovered.`,
        `Run ${result.state}.`, ...details,
        result.rejected.length > 0 ? describeRejections(result.rejected) : "",
        ...result.issues.map((issue) => issue.message),
        ...result.diagnostics.map((entry) => JSON.stringify(entry)),
        `Elapsed: ${result.elapsed}`, `${APP_NAME} ${VERSION}`
    ].filter(Boolean).join("\n\n");
}

function showCompletion(app, result) {
    const { showDetails } = require("./details-dialog.js");
    showDetails(app, { title: APP_NAME, summary: `Run ${result.state}.`, detail: completionMessage(result), buttons: ["OK"] });
}

module.exports = { describeRejections, completionMessage, showCompletion };
