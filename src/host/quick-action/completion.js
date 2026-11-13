"use strict";
const { APP_NAME, VERSION } = require("../../core/version.js");
const { summarizeRun } = require("../../core/run-summary.js");
const { headline, reportText } = require("../../core/run-report.js");

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

module.exports = { completionMessage, showCompletion };
