"use strict";
const { basename } = require("./paths.js");
const { isWorkspaceName } = require("./workspaces.js");
const { summarizeRun } = require("./run-summary.js");
const { supportedFormatList } = require("./formats.js");
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
    if (summary.kind === "setup") { return "A required tool is missing or unusable."; }
    if (summary.kind === "invalid") { return "The request is invalid."; }
    if (summary.kind === "nothing-to-convert") { return "Nothing to convert."; }
    if (summary.kind === "stopped") {
        if (summary.counts.saved === 0 && summary.counts.recovered === 0) { return `Stopped. ${made}`; }
        const unfinished = summary.notStarted + summary.counts.canceled;
        return `Stopped.${unfinished > 0 ? ` ${plural(unfinished, "PDF")} not created.` : ""}\n${made}`;
    }
    return summary.kind === "all-saved" ? made : `Finished with issues.\n${made}`;
}

// Only the counts that happened, so a run that saved one PDF does not also report zeros.
function countsLine(summary) {
    const parts = [[summary.counts.saved, "saved"], [summary.counts.recovered, "recovered"], [summary.counts.failed, "failed"],
        [summary.counts.canceled, "canceled"], [summary.notStarted, "not started"], [summary.refusals.length, "not included"]]
        .filter(([count]) => count > 0).map(([count, label]) => `${count} ${label}`);
    return parts.length > 0 ? `${parts.join("; ")}.` : "";
}

function recoveryReason(cause) {
    const diagnostic = cause?.diagnostic;
    const reason = [diagnostic?.message, ...(Array.isArray(diagnostic) ? diagnostic : []), cause?.message]
        .find((value) => typeof value === "string" && value.trim());
    return reason ? reason.replace(/\s+/gu, " ").trim() : "The requested destination was not used.";
}

function summaryText(summary, includeHeadline = true) {
    // An invalid request converted nothing, so it states its problems without counts or a conversion heading.
    if (summary.kind === "invalid" || summary.kind === "setup") {
        return [includeHeadline ? headline(summary) : "", ...summary.problems.map((entry) => entry.message)].filter(Boolean).join("\n\n");
    }
    const saved = summary.saved.map((group) => `${group.folder}\n${group.outputs.map((output) => output.name).join("\n")}`);
    const recovered = summary.recoveries.map((entry) => `${entry.location}\n${recoveryReason(entry.cause)}`);
    return [includeHeadline ? headline(summary) : "", countsLine(summary), saved.length > 0 ? `Saved to:\n${saved.join("\n\n")}` : "",
        summary.failures.length > 0 ? `Could not convert:\n${summary.failures.map((entry) => `${entry.source}: ${entry.message}`).join("\n")}` : "",
        recovered.length > 0 ? `Saved elsewhere:\n${recovered.join("\n\n")}` : "",
        summary.problems.length > 0 ? `Other issues:\n${summary.problems.map((entry) => `${entry.source ? `${entry.source}: ` : ""}${entry.message}`).join("\n")}` : "",
        summary.notStarted > 0 ? `Not started: ${summary.notStarted}` : "",
        summary.refusals.length > 0 ? describeRejections(summary.refusals) : ""
    ].filter(Boolean).join("\n\n");
}

function workspaceText(diagnostics) {
    const workspaces = diagnostics.filter((entry) => entry.stage === "workspace" &&
        ["workspace-retained", "workspace-reclaimed", "workspace-unreadable"].includes(entry.code) &&
        typeof entry.message === "string" && entry.message.trim() &&
        typeof entry.diagnostic?.path === "string" && isWorkspaceName(basename(entry.diagnostic.path)));
    return workspaces.length > 0 ? `Temporary work:\n${workspaces.map((entry) => `${entry.message}\n${entry.diagnostic.path}`).join("\n\n")}` : "";
}

// Elapsed time is the last section of the command-line report.
function reportText(result, includeHeadline = true) {
    return [summaryText(summarizeRun(result), includeHeadline), workspaceText(result.diagnostics), result.elapsed ? `Elapsed: ${result.elapsed}` : ""].filter(Boolean).join("\n\n");
}

function noImagesHeadline(rejected) {
    return rejected.length > 0 ? "Nothing to convert." : "No images selected.";
}

function describeNoImages(rejected, includeHeadline = true) {
    const detail = rejected.length > 0 ? describeRejections(rejected)
        : "Select image files or folders in Finder, then run the action again.\n\n" +
            `Supported: ${supportedFormatList()}.`;
    return includeHeadline ? `${noImagesHeadline(rejected)}\n\n${detail}` : detail;
}

module.exports = { describeRejections, headline, summaryText, reportText, noImagesHeadline, describeNoImages };
