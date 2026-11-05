"use strict";
const { APP_NAME, VERSION } = require("../core/version.js");
const { summarizeRun } = require("../core/run-summary.js");
const { plural } = require("./formatting.js");

function describeRejections(rejected, heading = "Not included from your selection:") {
    return `${heading}\n${rejected.map((entry) => `${entry.path || entry.name}: ${entry.reason}`).join("\n")}`;
}

/*
 * A recovered PDF exists, just not where it was meant to go, so a headline
 * counting only saved PDFs would say nothing was created about a run that
 * made one.
 */
function madeSentence(counts) {
    const saved = counts.saved > 0 ? `Created ${plural(counts.saved, "PDF")}.` : "";
    const one = counts.recovered === 1;
    const recovered = counts.recovered > 0
        ? `${plural(counts.recovered, "PDF")} could not be saved where ${one ? "it was" : "they were"} meant to go and ${one ? "was" : "were"} kept elsewhere; the location is below.`
        : "";
    return [saved, recovered].filter(Boolean).join(" ") || "No PDF was created.";
}

function headline(summary) {
    const made = madeSentence(summary.counts);
    if (summary.kind === "invalid") { return "The request is invalid."; }
    if (summary.kind === "nothing-to-convert") { return "Nothing to convert."; }
    if (summary.kind === "stopped") { return `Stopped. ${plural(summary.notStarted + summary.counts.canceled, "PDF")} not created.\n${made}`; }
    return summary.kind === "all-saved" ? made : `Finished with issues.\n${made}`;
}

// Only the counts that happened, so a run that saved one PDF does not also report zeros.
function countsLine(summary) {
    const parts = [[summary.counts.saved, "saved"], [summary.counts.recovered, "recovered"], [summary.counts.failed, "failed"],
        [summary.counts.canceled, "canceled"], [summary.notStarted, "not started"], [summary.refusals.length, "not included"]]
        .filter(([count]) => count > 0).map(([count, label]) => `${count} ${label}`);
    return parts.length > 0 ? `${parts.join("; ")}.` : "";
}

function summaryText(summary, includeHeadline = true) {
    // An invalid request converted nothing, so it states its problems without counts or a conversion heading.
    if (summary.kind === "invalid") {
        return [includeHeadline ? headline(summary) : "", ...summary.failures.map((entry) => entry.message)].filter(Boolean).join("\n\n");
    }
    const saved = summary.saved.map((group) => `${group.folder}\n${group.outputs.map((output) => output.name).join("\n")}`);
    const recovered = summary.recoveries.map((entry) => entry.location);
    return [includeHeadline ? headline(summary) : "", countsLine(summary), saved.length > 0 ? `Saved to:\n${saved.join("\n\n")}` : "",
        summary.failures.length > 0 ? `Could not convert:\n${summary.failures.map((entry) => `${entry.source ? `${entry.source}: ` : ""}${entry.message}`).join("\n")}` : "",
        recovered.length > 0 ? `Recovered PDFs:\n${recovered.join("\n")}` : "",
        summary.notStarted > 0 ? `Not started: ${summary.notStarted}` : "",
        summary.refusals.length > 0 ? describeRejections(summary.refusals) : ""
    ].filter(Boolean).join("\n\n");
}

// Elapsed time is the last section of the command-line report.
function reportText(result, includeHeadline = true) {
    return [summaryText(summarizeRun(result), includeHeadline), result.elapsed ? `Elapsed: ${result.elapsed}` : ""].filter(Boolean).join("\n\n");
}

// The dialog adds the version after the elapsed time; the command line has --version for that.
function completionMessage(result, includeHeadline = true) {
    return [reportText(result, includeHeadline), `${APP_NAME} ${VERSION}`].join("\n\n");
}

function revealOutputs(paths) {
    ObjC.import("AppKit");
    $.NSWorkspace.sharedWorkspace.activateFileViewerSelectingURLs($(paths.map((path) => $.NSURL.fileURLWithPath(path))));
}

function diagnosticLines(value, label = "") {
    if (value === null || value === undefined) { return []; }
    if (typeof value !== "object") { return [`${label}${String(value).replace(/\r\n?/gu, "\n")}`]; }
    return Object.entries(value).filter(([key]) => key !== "stack").flatMap(([key, entry]) => diagnosticLines(entry, `${label}${key}: `));
}

function technicalDetails(result) {
    const issues = [...result.issues, ...result.rejected, ...result.documents.flatMap((document) => [...document.issues, ...(document.diagnostics ?? [])])];
    return [...result.diagnostics, ...issues.flatMap((issue) => issue.diagnostic ? [{ code: issue.code, stage: issue.stage, ...issue.diagnostic }] : [])]
        .flatMap((entry) => diagnosticLines(entry)).join("\n");
}

function showCompletion(app, result, reveal = revealOutputs) {
    const { showDetails } = require("./details-dialog.js");
    const summary = summarizeRun(result);
    const diagnostics = technicalDetails(result);
    const paths = [...summary.saved.flatMap((group) => group.outputs.map((output) => output.path)), ...summary.recoveries.map((entry) => entry.location)];
    const buttons = ["OK", ...paths.length > 0 ? ["Show in Finder"] : [], ...diagnostics ? ["Details"] : []];
    // Details is a detour, not an ending: reading it must not take away Show
    // in Finder, so the summary returns until it is dismissed another way.
    for (;;) {
        const response = showDetails(app, { title: APP_NAME, summary: headline(summary), detail: completionMessage(result, false), fallbackDetail: completionMessage(result), buttons });
        if (buttons[response] !== "Details") {
            if (buttons[response] === "Show in Finder") { reveal(paths); }
            return;
        }
        showDetails(app, { title: APP_NAME, summary: "Technical details (selectable and copyable)", detail: diagnostics, buttons: ["Back"] });
    }
}

module.exports = { describeRejections, headline, summaryText, reportText, completionMessage, showCompletion };
