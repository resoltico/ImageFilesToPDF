"use strict";
const { isSetupRefusal } = require("./outcomes.js");
const { dirname, basename } = require("./paths.js");

function summaryKind(outcome, counts) {
    if (outcome.state === "invalid" && outcome.issues.some(isSetupRefusal)) { return "setup"; }
    if (outcome.state === "invalid") { return "invalid"; }
    if (outcome.state === "canceled" || counts["not-started"] > 0) { return "stopped"; }
    if (outcome.documents.length === 0 && outcome.issues.every((issue) => issue.code === "no-images")) { return "nothing-to-convert"; }
    if (counts.saved === outcome.documents.length && counts.saved > 0 && outcome.issues.length === 0 &&
        outcome.documents.every((document) => document.issues.length === 0)) { return "all-saved"; }
    return counts.saved > 0 ? "some-saved" : "none-saved";
}

function recoveryCause(issues) {
    return issues.find((issue) => issue.stage === "publication" && issue.code !== "canceled")
        ?? issues.find((issue) => issue.stage === "publication") ?? issues[0];
}

/** Presentation-independent facts; machine run state and GUI consent semantics remain distinct. */
function summarizeRun(outcome) {
    const counts = { saved: 0, recovered: 0, failed: 0, canceled: 0, "not-started": 0 };
    const folders = new Map();
    const failures = [];
    const recoveries = [];
    const problems = [];
    for (const document of outcome.documents) {
        counts[document.state] += 1;
        if (document.state === "saved") {
            const folder = dirname(document.output);
            if (!folders.has(folder)) { folders.set(folder, []); }
            folders.get(folder).push({ path: document.output, name: basename(document.output), sources: document.sources });
        }
        const cause = document.state === "recovered" ? recoveryCause(document.issues) : null;
        if (document.state === "recovered") { recoveries.push({ location: document.recovery, sources: document.sources, ...(cause ? { cause } : {}) }); }
        const into = document.state === "failed" ? failures : problems;
        into.push(...document.issues.filter((issue) => issue.code !== "canceled" && issue !== cause)
            .map((issue) => ({ source: issue.source ?? document.sources[0], message: issue.message })));
    }
    problems.push(...outcome.issues.filter((issue) => issue.code !== "canceled" && issue.code !== "no-images")
        .map((issue) => ({ source: issue.source ?? "", message: issue.message })));
    return { kind: summaryKind(outcome, counts), counts,
        saved: Array.from(folders, ([folder, outputs]) => ({ folder, outputs })), failures, recoveries, problems,
        notStarted: counts["not-started"], refusals: outcome.rejected };
}
module.exports = { summarizeRun };
