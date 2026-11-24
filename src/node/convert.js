"use strict";
const { message } = require("../core/messages.js");
const fs = require("node:fs");
const { execute } = require("../application/workflow.js");
const { createProgress } = require("../application/progress.js");
const { OperationError } = require("../core/errors.js");
const { failedRun, noImagesOutcome, issuesOf, ISSUE } = require("../core/outcomes.js");
const { WINDOWS, resolvedSource, outputName } = require("./paths.js");
const { localFilesystem } = require("./filesystem.js");
const { windowsNative } = require("./windows.js");
const { destinationOperations } = require("./publication.js");
const { workspaceStore } = require("./workspaces.js");
const { commandOutput } = require("./processes.js");
const { checkTools } = require("./tools.js");

function configure(commands) {
    const windows = WINDOWS ? windowsNative(commands) : null;
    const files = localFilesystem(windows);
    const destination = destinationOperations(files);
    let storage = null;

    return {
        capabilities() {
            storage = workspaceStore(files, commands, windows);
            return { ...files, ...destination, storage };
        },
        operations: {
            ...destination.operations,
            fits: commands.fits,
            run(argv, label) {
                commands.checkpoint();
                return commandOutput(storage.command(argv, commands.request), argv, label);
            },
            resolve: resolvedSource,
            outputName,
            fileKind: (file) => files.tree.inspect(file).kind,
            verifyFile(file, label) {
                if (destination.publication.facts(file).size <= 0) {
                    throw new OperationError(message("fileEmptyOrInvalid", { label, path: file }));
                }
            },
            removeFile(file) {
                try {
                    if (!storage.canReleaseFiles()) { throw new OperationError(message("workspaceWriterMayBeActive")); }
                    fs.rmSync(file, { force: true });
                    return { state: "removed" };
                }
                catch (error) {
                    const [issue] = issuesOf(error, "cleanup");
                    return { state: "failed", issue: { ...issue, code: ISSUE.cleanup, diagnostic: { path: file, message: error.message } } };
                }
            },
            createWorkspace: () => storage.create(),
            removeWorkspace: (directory) => storage.removeWorkspace(directory),
            setAside: (file) => ({ state: "retained", path: file, issues: [] })
        }
    };
}

function convert(invocation, commands) {
    const progress = createProgress([], commands.stopped);
    try {
        const configured = configure(commands);
        return execute(invocation, {
            ...configured, checkTools: () => checkTools(commands), reclaim: (storage) => storage.reclaim(), now: () => new Date(),
            interaction: { progress, collect: (input) => input, settings: () => invocation.settings,
                noImages: noImagesOutcome, present: (result) => result }
        });
    } catch (error) {
        const result = failedRun(error, error.outcome);
        if (!error.outcome) { result.diagnostics.push(...progress.diagnostics); }
        return result;
    } finally { progress.close(); }
}
module.exports = { convert };
