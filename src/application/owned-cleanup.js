"use strict";
const { message } = require("../core/messages.js");
const { ISSUE } = require("../core/outcomes.js");
const { OperationError, UserCanceled } = require("../core/errors.js");

function removeOwned(job, path) {
    const outcome = job.operations.removeFile(path);
    if (outcome.state === "failed") { job.cleanupIssues.push({ ...outcome.issue, source: path }); }
}

function requireReleasedResources(job) {
    if (job.cleanupIssues.length > 0) {
        const error = job.cleanupIssues.some((issue) => issue.code === ISSUE.canceled)
            ? new UserCanceled({ issues: job.cleanupIssues.slice() }) : new OperationError(message("ownedWorkReleaseFailed"), { issues: job.cleanupIssues.slice() });
        throw error;
    }
}
module.exports = { removeOwned, requireReleasedResources };
