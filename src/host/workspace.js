"use strict";
const { MKTEMP, RM, PS } = require("./backend-executables.js");
const { OperationError } = require("../core/errors.js");
const { ISSUE } = require("../core/outcomes.js");
const { releaseArtifact, hasRetainedArtifacts } = require("../core/artifacts.js");
const { isWorkspaceName, workspaceDisposition, validWorkspaceOwner } = require("../core/workspaces.js");
const { buildProcessStartArgv, buildProcessListArgv, readProcessList } = require("../backend/processes.js");
const { shellJoin } = require("../backend/shell.js");
const { runArgv, cleanupArgv } = require("./shell.js");
const WORKSPACE_PATTERN = /\/ImageFilesToPDF\.[^/]+$/u;
const NONCE_RANGE = 1000000000;
const RETAIN = "retain";
const OWNER = "owner.json";

function processOutput(app, argv) { return app.doShellScript(`LC_ALL=C TZ=UTC ${shellJoin(argv)}`); }

function removeWorkspace(app, path) {
    return path && WORKSPACE_PATTERN.test(path) ? cleanupArgv(app, [RM, "-rf", path]) : { state: "skipped" };
}


function createWorkspace(app, storage) {
    const path = String(runArgv(app, [MKTEMP, "-d", "-t", "ImageFilesToPDF"], "creating temporary workspace")).trim();
    if (!WORKSPACE_PATTERN.test(path)) { throw new Error("mktemp returned an unexpected workspace path."); }
    try {
        const owner = { pid: storage.pid, started: String(processOutput(app, buildProcessStartArgv(PS, storage.pid))).trim() };
        if (!validWorkspaceOwner(owner)) { throw new OperationError("The workspace owner could not be established."); }
        storage.write(`${path}/${OWNER}`, JSON.stringify(owner));
    } catch (error) { removeWorkspace(app, path); throw error; }
    return path;
}


function workspaceDiagnostic(code, path, message, error = null) {
    return { code, stage: "workspace", message, diagnostic: { path, ...(error ? { message: error.message } : {}) } };
}

function reclaimOne(app, storage, path, processes) {
    try {
        const retained = storage.entries(path).includes(RETAIN);
        const owner = retained ? null : JSON.parse(storage.read(`${path}/${OWNER}`));
        const disposition = workspaceDisposition(owner, retained, processes);
        if (disposition === "active") { return null; }
        if (disposition === "reclaim") {
            const removed = removeWorkspace(app, path);
            return removed.state === "failed" ? workspaceDiagnostic("workspace-unreadable", path, "A stale workspace could not be reclaimed.", removed.issue) : null;
        }
        return workspaceDiagnostic(`workspace-${disposition}`, path, "A retained or unreadable workspace was left in place.");
    } catch (error) { return workspaceDiagnostic("workspace-unreadable", path, "A workspace could not be inspected and was left in place.", error); }
}

function reclaimWorkspaces(app, storage) {
    try {
        const names = storage.entries(storage.temporary).filter(isWorkspaceName);
        if (names.length === 0) { return []; }
        const processes = readProcessList(processOutput(app, buildProcessListArgv(PS)));
        return names.map((name) => reclaimOne(app, storage, `${storage.temporary}/${name}`, processes)).filter(Boolean);
    } catch (error) { return [workspaceDiagnostic("workspace-unreadable", storage.temporary, "Temporary workspaces could not be checked.", error)]; }
}

function retainCandidate(job) { job.storage.write(`${job.workspace}/${RETAIN}`, "validating\n"); }

function clearRetention(job) {
    if (job.storage.entries(job.workspace).includes(RETAIN)) {
        try { job.storage.remove(`${job.workspace}/${RETAIN}`); }
        catch (error) {
            const failure = new OperationError("The workspace retention marker could not be cleared.", { cause: error });
            failure.issues = [{ code: ISSUE.cleanup, stage: "cleanup", message: failure.message, diagnostic: { path: job.workspace } }];
            throw failure;
        }
    }
}

function releaseOwnedArtifact(job, path) {
    releaseArtifact(job.artifacts, path);
    if (!hasRetainedArtifacts(job.artifacts)) { clearRetention(job); }
}

function nonce() { return `${Date.now()}-${Math.floor(Math.random() * NONCE_RANGE)}`; }
module.exports = { createWorkspace, removeWorkspace, reclaimWorkspaces, retainCandidate, clearRetention, releaseOwnedArtifact, nonce };
