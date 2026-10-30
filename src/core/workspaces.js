"use strict";
const NAME = /^ImageFilesToPDF\.[A-Za-z0-9]{10}$/u;

function isWorkspaceName(name) { return NAME.test(name); }

function validWorkspaceOwner(owner) {
    return Boolean(owner) && Number.isSafeInteger(owner.pid) && owner.pid > 0 &&
        typeof owner.started === "string" && owner.started.trim().length > 0;
}

/** Unknown ownership/retention is never authority to delete. */
function workspaceDisposition(owner, retained, processes) {
    if (retained === true) { return "retained"; }
    if (retained !== false || !validWorkspaceOwner(owner) || !Array.isArray(processes)) { return "unreadable"; }
    return processes.some((process) => process.pid === owner.pid && process.started === owner.started) ? "active" : "reclaim";
}
module.exports = { isWorkspaceName, validWorkspaceOwner, workspaceDisposition };
