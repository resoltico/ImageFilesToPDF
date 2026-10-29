"use strict";
const { ISSUE } = require("../core/outcomes.js");
const { OperationError, UserCancelled } = require("../core/errors.js");
const { removeFile } = require("./shell.js");

function removeOwned(job, path) {
    const outcome = removeFile(job.app, path);
    if (outcome.state === "failed") { job.cleanupIssues.push({ ...outcome.issue, source: path }); }
}

function requireReleasedResources(job) {
    if (job.cleanupIssues.length > 0) {
        const error = job.cleanupIssues.some((issue) => issue.code === ISSUE.cancelled)
            ? new UserCancelled() : new OperationError("Owned temporary work could not be released; conversion stopped to preserve the resource bound.");
        error.issues = job.cleanupIssues.slice();
        throw error;
    }
}
module.exports = { removeOwned, requireReleasedResources };
