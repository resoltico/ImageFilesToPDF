"use strict";
const { OperationError } = require("../core/errors.js");
const { ISSUE } = require("../core/outcomes.js");
const { releaseArtifact, hasRetainedArtifacts } = require("../core/artifacts.js");
const RETAIN = "retain";

function retainCandidate(job) { job.storage.write(`${job.workspace}/${RETAIN}`, "validating\n"); }

function clearRetention(job) {
    if (job.storage.entries(job.workspace).includes(RETAIN)) {
        try { job.storage.remove(`${job.workspace}/${RETAIN}`); }
        catch (error) {
            const message = "The workspace retention marker could not be cleared.";
            const failure = new OperationError(message, { cause: error, issues: [{ code: ISSUE.cleanup, stage: "cleanup", message, diagnostic: { path: job.workspace } }] });
            throw failure;
        }
    }
}

function releaseOwnedArtifact(job, path) {
    releaseArtifact(job.artifacts, path);
    if (!hasRetainedArtifacts(job.artifacts)) { clearRetention(job); }
}

module.exports = { retainCandidate, clearRetention, releaseOwnedArtifact };
