"use strict";
const { dirname, basename } = require("./paths.js");

function summaryKind(outcome, counts) {
    if (outcome.state === "invalid") { return "invalid"; }
    if (outcome.state === "cancelled" || counts["not-started"] > 0) { return "stopped"; }
    if (outcome.documents.length === 0 && outcome.issues.every((issue) => issue.code === "no-images")) { return "nothing-to-convert"; }
    if (counts.saved === outcome.documents.length && counts.saved > 0 && outcome.issues.length === 0 &&
        outcome.documents.every((document) => document.issues.length === 0)) { return "all-saved"; }
    return counts.saved > 0 ? "some-saved" : "none-saved";
}

/** Presentation-independent facts; machine run state and GUI consent semantics remain distinct. */
function summarizeRun(outcome) {
    const counts = { saved: 0, recovered: 0, failed: 0, cancelled: 0, "not-started": 0 };
    const folders = new Map();
    const failures = [];
    const recoveries = [];
    for (const document of outcome.documents) {
        counts[document.state] += 1;
        if (document.state === "saved") {
            const folder = dirname(document.output);
            if (!folders.has(folder)) { folders.set(folder, []); }
            folders.get(folder).push({ path: document.output, name: basename(document.output), sources: document.sources });
        }
        if (document.state === "recovered") { recoveries.push({ location: document.recovery, sources: document.sources }); }
        for (const issue of document.issues) {
            if (issue.code !== "cancelled") { failures.push({ source: issue.source ?? document.sources[0], message: issue.message }); }
        }
    }
    failures.push(...outcome.issues.filter((issue) => issue.code !== "cancelled" && issue.code !== "no-images")
        .map((issue) => ({ source: issue.source ?? "", message: issue.message })));
    return { kind: summaryKind(outcome, counts), counts,
        saved: Array.from(folders, ([folder, outputs]) => ({ folder, outputs })), failures, recoveries,
        notStarted: counts["not-started"], refusals: outcome.rejected };
}
module.exports = { summarizeRun };
