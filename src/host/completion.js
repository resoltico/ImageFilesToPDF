"use strict";
const { APP_NAME, VERSION } = require("../core/version.js");
const { summarizeRun } = require("../core/run-summary.js");
const { plural } = require("./formatting.js");

function describeRejections(rejected, heading = "Not included from your selection:") {
    return `${heading}\n${rejected.map((entry) => `${entry.path || entry.name}: ${entry.reason}`).join("\n")}`;
}

function headline(summary) {
    const created = summary.counts.saved > 0 ? `Created ${plural(summary.counts.saved, "PDF")}.` : "No PDF was created.";
    if (summary.kind === "invalid") { return "The request is invalid."; }
    if (summary.kind === "nothing-to-convert") { return "Nothing to convert."; }
    if (summary.kind === "stopped") { return `${created}\nStopped. ${plural(summary.notStarted + summary.counts.cancelled, "PDF")} not created.`; }
    return summary.kind === "all-saved" ? created : `Finished with errors.\n${created}`;
}

function summaryText(summary) {
    const saved = summary.saved.map((group) => `${group.folder}\n${group.outputs.map((output) => output.name).join("\n")}`);
    const recovered = summary.recoveries.map((entry) => entry.location);
    return [headline(summary), `${plural(summary.counts.saved, "PDF")} saved; ${plural(summary.counts.recovered, "PDF")} recovered; ${plural(summary.counts.failed, "PDF")} failed.`, saved.length > 0 ? `Saved to:\n${saved.join("\n\n")}` : "",
        summary.failures.length > 0 ? `Could not convert:\n${summary.failures.map((entry) => `${entry.source ? `${entry.source}: ` : ""}${entry.message}`).join("\n")}` : "",
        recovered.length > 0 ? `Recovered PDFs:\n${recovered.join("\n")}` : "",
        summary.notStarted > 0 ? `Not started: ${summary.notStarted}` : "",
        summary.refusals.length > 0 ? describeRejections(summary.refusals) : ""
    ].filter(Boolean).join("\n\n");
}

function completionMessage(result) {
    return [summaryText(summarizeRun(result)), result.elapsed ? `Elapsed: ${result.elapsed}` : "", `${APP_NAME} ${VERSION}`].filter(Boolean).join("\n\n");
}

function showCompletion(app, result) {
    const { showDetails } = require("./details-dialog.js");
    showDetails(app, { title: APP_NAME, summary: headline(summarizeRun(result)), detail: completionMessage(result), buttons: ["OK"] });
}
module.exports = { describeRejections, headline, summaryText, completionMessage, showCompletion };
