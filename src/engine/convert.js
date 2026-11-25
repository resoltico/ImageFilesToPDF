"use strict";
const { message } = require("../core/messages.js");
const fs = require("node:fs");
const { availableParallelism } = require("node:os");
const { platform } = require("node:process");
const { darwinHelper } = require("./platform/darwin.js");
const { execute } = require("../application/workflow.js");
const { createProgress } = require("../application/progress.js");
const { OperationError } = require("../core/errors.js");
const { failedRun, noImagesOutcome, issuesOf, ISSUE } = require("../core/outcomes.js");
const { WINDOWS, resolvedSource, outputName, toolPath } = require("./paths.js");
const { localFilesystem } = require("./filesystem.js");
const { windowsNative } = require("./platform/win32.js");
const { destinationOperations } = require("./publication.js");
const { workspaceStore } = require("./workspaces.js");
const { commandOutput } = require("./processes.js");
const { checkTools } = require("./tools.js");

const MAX_PREPARATION_WORKERS = 4;

function configure(commands) {
    const windows = WINDOWS ? windowsNative(commands) : null;
    const mac = platform === "darwin" ? darwinHelper() : null;
    const files = localFilesystem(windows, mac);
    const destination = destinationOperations(files, mac, windows);
    let storage = null;

    return {
        close: () => (mac ?? windows)?.close(),
        async capabilities() {
            storage = await workspaceStore(files, commands, windows);
            return { ...files, ...destination, storage };
        },
        operations: {
            ...destination.operations,
            fits: commands.fits,
            toolPath,
            checkpoint: commands.checkpoint,
            preparationConcurrency: Math.max(1, Math.min(MAX_PREPARATION_WORKERS, availableParallelism() - 1)),
            async run(argv, label) {
                commands.checkpoint();
                return commandOutput(await storage.command(argv, commands.request), argv, label);
            },
            resolve: resolvedSource,
            outputName,
            fileKind: async (file) => (await files.tree.inspect(file)).kind,
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

async function convert(invocation, commands, { session, toolPaths } = {}) {
    const progress = createProgress(session ? [session.sink] : [], commands.stopped);
    let configured = null;
    const outcome = await (async () => {
        try {
            configured = configure(commands);
            return await execute(invocation, {
                ...configured, checkTools: () => checkTools(commands, toolPaths), reclaim: (storage) => storage.reclaim(), now: () => new Date(),
                interaction: { progress, collect: (input) => input, settings: session?.settings ?? (() => invocation.settings),
                    noImages: noImagesOutcome, present: (result) => result }
            });
        } catch (error) {
            const result = failedRun(error, error.outcome);
            if (!error.outcome) { result.diagnostics.push(...progress.diagnostics); }
            return result;
        } finally { progress.close(); }
    })();
    try { await configured?.close(); }
    catch (error) { return failedRun(error, outcome); }
    return outcome;
}
module.exports = { convert };
