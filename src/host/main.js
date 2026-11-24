"use strict";
const { checkTools } = require("./preflight.js");
const { createTree } = require("./tree.js");
const { workspaceAccess } = require("./workspace-access.js");
const { reclaimWorkspaces } = require("./workspace.js");
const { sourceAccess } = require("./source-capture.js");
const { nativeDestinationNames } = require("./destination-names.js");
const { nativePublication } = require("./native-publication.js");

const { execute } = require("../application/workflow.js");
const { runOperations } = require("./run-operations.js");

function hostCapabilities() {
    const tree = createTree(globalThis.ObjC, globalThis.$, globalThis.Ref);
    return { tree, destinationNames: nativeDestinationNames(globalThis.ObjC, globalThis.$), storage: workspaceAccess(globalThis.ObjC, globalThis.$), sources: sourceAccess(globalThis.ObjC, globalThis.$),
        publication: nativePublication(globalThis.ObjC, globalThis.$) };
}

function executeQuickAction(app, input, options) {
    return execute(input, {
        ...options, operations: runOperations(app),
        checkTools: () => checkTools(app),
        capabilities: options.capabilities ?? hostCapabilities,
        reclaim: (storage) => reclaimWorkspaces(app, storage),
        now: () => new Date()
    });
}

function application() {
    const app = Application.currentApplication();
    app.includeStandardAdditions = true;
    return app;
}
module.exports = { execute: executeQuickAction, application };
