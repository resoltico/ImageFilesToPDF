"use strict";
const WORKSPACE_PREFIX = "run-";
const WORKSPACE_SUFFIX = /^[A-Za-z0-9]{6}$/u;

function isWorkspaceName(name) { return name.startsWith(WORKSPACE_PREFIX) && WORKSPACE_SUFFIX.test(name.slice(WORKSPACE_PREFIX.length)); }

function validWorkspaceOwner(owner) {
    return Boolean(owner) && Number.isSafeInteger(owner.pid) && owner.pid > 0 &&
        typeof owner.started === "string" && owner.started.trim().length > 0;
}

module.exports = { WORKSPACE_PREFIX, isWorkspaceName, validWorkspaceOwner };
