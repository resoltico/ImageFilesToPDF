"use strict";
const { OperationError } = require("../core/errors.js");
const { sourceIssues } = require("../core/source-policy.js");
const { readMetadata } = require("../backend/metadata.js");
const { runArgv } = require("./shell.js");
const LAST_ORIENTATION = 8;

function inspectSource(job, owned) {
    const metadata = String(runArgv(job.app, [job.tools.vipsheader, "-a", owned.path], "inspecting source format"));
    const facts = readMetadata(metadata);
    if (facts.width === 0 || facts.height === 0 || facts.bands === 0 || facts.orientation < 1 || facts.orientation > LAST_ORIENTATION) {
        throw new OperationError("The image metadata is damaged or incomplete.");
    }
    if (facts.format === "PNG") { facts.pages = job.sources.pngCount(owned.path); }
    const issues = sourceIssues(facts);
    if (issues.length > 0) {
        const error = new OperationError(issues.map((issue) => issue.message).join("\n"));
        error.issues = issues;
        throw error;
    }
    return { ...owned, ...facts };
}
module.exports = { inspectSource };
