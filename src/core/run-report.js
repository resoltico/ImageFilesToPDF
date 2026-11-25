"use strict";
const { basename } = require("./paths.js");
const { isWorkspaceName } = require("./workspaces.js");
const { summarizeRun } = require("./run-summary.js");
const { supportedFormatList } = require("./formats.js");
const { message } = require("./messages.js");

const canonicalPath = (path) => path;

function describeRejections(rejected, heading = message("reportRefusals"), renderPath = canonicalPath) {
    return `${heading}\n${rejected.map((entry) => message("fileIssue", { path: renderPath(entry.path || entry.name), reason: entry.reason })).join("\n")}`;
}

/*
 * A recovered PDF exists, just not where it was meant to go, so a headline
 * counting only saved PDFs would say nothing was created about a run that
 * made one.
 */
function madeSentence(counts) {
    const saved = counts.saved > 0 ? message("pdfsCreated", { count: counts.saved }) : "";
    const recovered = counts.recovered > 0
        ? message("pdfsRecovered", { count: counts.recovered })
        : "";
    return [saved, recovered].filter(Boolean).join(" ") || message("noPdfCreated");
}

function headline(summary) {
    const made = madeSentence(summary.counts);
    if (summary.kind === "setup") { return message("setupFailed"); }
    if (summary.kind === "invalid") { return message("invalidRequest"); }
    if (summary.kind === "nothing-to-convert") { return message("nothingToConvert"); }
    if (summary.kind === "stopped") {
        if (summary.counts.saved === 0 && summary.counts.recovered === 0) { return `${message("stopped")} ${made}`; }
        const unfinished = summary.notStarted + summary.counts.canceled;
        return `${message("stopped")}${unfinished > 0 ? ` ${message("pdfsNotCreated", { count: unfinished })}` : ""}\n${made}`;
    }
    return summary.kind === "all-saved" ? made : `${message("finishedWithIssues")}\n${made}`;
}

// Only the counts that happened, so a run that saved one PDF does not also report zeros.
function countsLine(summary) {
    const parts = [[summary.counts.saved, "reportCountSaved"], [summary.counts.recovered, "reportCountRecovered"],
        [summary.counts.failed, "reportCountFailed"], [summary.counts.canceled, "reportCountCanceled"],
        [summary.notStarted, "reportCountNotStarted"], [summary.refusals.length, "reportCountNotIncluded"]]
        .filter(([count]) => count > 0).map(([count, key]) => message(key, { count }));
    return parts.length > 0 ? `${parts.join("; ")}.` : "";
}

function recoveryReason(cause) {
    const diagnostic = cause?.diagnostic;
    const reason = [diagnostic?.message, ...(Array.isArray(diagnostic) ? diagnostic : []), cause?.message]
        .find((value) => typeof value === "string" && value.trim());
    return reason ? reason.replace(/\s+/gu, " ").trim() : message("destinationUnused");
}

function summaryText(summary, includeHeadline, renderPath) {
    // An invalid request converted nothing, so it states its problems without counts or a conversion heading.
    if (summary.kind === "invalid" || summary.kind === "setup") {
        return [includeHeadline ? headline(summary) : "", ...summary.problems.map((entry) => entry.message)].filter(Boolean).join("\n\n");
    }
    const saved = summary.saved.map((group) => `${renderPath(group.folder)}\n${group.outputs.map((output) => output.name).join("\n")}`);
    const recovered = summary.recoveries.map((entry) => `${renderPath(entry.location)}\n${recoveryReason(entry.cause)}`);
    return [includeHeadline ? headline(summary) : "", countsLine(summary), saved.length > 0 ? `${message("reportSaved")}\n${saved.join("\n\n")}` : "",
        summary.failures.length > 0 ? `${message("reportFailures")}\n${summary.failures.map((entry) => message("fileIssue", { path: renderPath(entry.source), reason: entry.message })).join("\n")}` : "",
        recovered.length > 0 ? `${message("reportRecoveries")}\n${recovered.join("\n\n")}` : "",
        summary.problems.length > 0 ? `${message("reportOtherIssues")}\n${summary.problems.map((entry) => entry.source ? message("fileIssue", { path: renderPath(entry.source), reason: entry.message }) : entry.message).join("\n")}` : "",
        summary.notStarted > 0 ? message("reportNotStarted", { count: summary.notStarted }) : "",
        summary.refusals.length > 0 ? describeRejections(summary.refusals, undefined, renderPath) : ""
    ].filter(Boolean).join("\n\n");
}

function workspaceText(diagnostics, renderPath) {
    const workspaces = diagnostics.filter((entry) => entry.stage === "workspace" &&
        ["workspace-retained", "workspace-reclaimed", "workspace-unreadable"].includes(entry.code) &&
        typeof entry.message === "string" && entry.message.trim() &&
        typeof entry.diagnostic?.path === "string" && isWorkspaceName(basename(entry.diagnostic.path)));
    return workspaces.length > 0 ? `${message("reportWorkspaces")}\n${workspaces.map((entry) => `${entry.message}\n${renderPath(entry.diagnostic.path)}`).join("\n\n")}` : "";
}

// Elapsed time is the last section of the command-line report.
function reportText(result, includeHeadline = true, renderPath = canonicalPath) {
    return [summaryText(summarizeRun(result), includeHeadline, renderPath), workspaceText(result.diagnostics, renderPath), result.elapsed ? message("reportElapsed", { time: result.elapsed }) : ""].filter(Boolean).join("\n\n");
}

function noImagesHeadline(rejected) {
    return rejected.length > 0 ? message("nothingToConvert") : message("noImagesSelected");
}

function describeNoImages(rejected, includeHeadline = true) {
    const detail = rejected.length > 0 ? describeRejections(rejected)
        : [message("selectImagesInFinder"), message("supportedFormats", { formats: supportedFormatList() })].join("\n\n");
    return includeHeadline ? `${noImagesHeadline(rejected)}\n\n${detail}` : detail;
}

module.exports = { headline, reportText, noImagesHeadline, describeNoImages };
