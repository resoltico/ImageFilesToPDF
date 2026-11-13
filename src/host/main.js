"use strict";
const { formatDuration } = require("../core/formatting.js");
const { OperationError } = require("../core/errors.js");
const { executeRun } = require("../application/run.js");
const { checkTools } = require("./preflight.js");
const { inspectCandidates } = require("./source-inspection.js");
const { collectImageFiles } = require("./admission.js");
const { createTree } = require("./tree.js");
const { workspaceAccess } = require("./workspace-access.js");
const { reclaimWorkspaces } = require("./workspace.js");
const { sourceAccess } = require("./source-capture.js");
const { nativeDestinationNames } = require("./destination-names.js");
const { nativePublication } = require("./native-publication.js");
const { makeTimestamp } = require("../core/timestamps.js");
const { createJob, unitsOf, runJob } = require("./job.js");

function hostCapabilities() {
    const tree = createTree(globalThis.ObjC, globalThis.$, globalThis.Ref);
    return { tree, destinationNames: nativeDestinationNames(globalThis.ObjC, globalThis.$), storage: workspaceAccess(globalThis.ObjC, globalThis.$), sources: sourceAccess(globalThis.ObjC, globalThis.$),
        publication: nativePublication(globalThis.ObjC, globalThis.$) };
}

function prepare(app, input, options) {
    options.interaction.progress.phase("Checking required tools");
    const tools = checkTools(app);
    const invocation = options.interaction.collect(input);
    const capabilities = options.capabilities ?? hostCapabilities();
    const { tree, sources, publication, storage, destinationNames } = capabilities;
    if (!tree || !sources || !publication || !storage || !destinationNames || typeof destinationNames.groups !== "function" || ["facts", "readable", "capture", "pngCount"].some((method) => typeof sources[method] !== "function")) { throw new OperationError("Required filesystem/source capabilities are unavailable."); }
    options.interaction.progress.diagnostics.push(...reclaimWorkspaces(app, storage));
    options.interaction.progress.phase("Finding images");
    const selected = collectImageFiles(app, invocation.inputItems, tree);
    const selection = inspectCandidates(app, selected, { tools, sources, progress: options.interaction.progress });
    return { tools, invocation, ...capabilities, selection };
}

function jobFor(app, request, settings, report) {
    const job = createJob(app, settings, request.invocation.timestamp || makeTimestamp(new Date()), request);
    Object.assign(job, { sources: request.sources, publication: request.publication, progress: report });
    const images = request.selection.images.length;
    report.expect({ units: unitsOf(settings, images), images });
    return job;
}

function execute(app, input, options) {
    const { interaction } = options;
    const report = interaction.progress;
    let started = null;
    return executeRun({
        progress: report,
        prepare: () => prepare(app, input, options),
        createJob: (request, settings) => jobFor(app, request, settings, report),
        convert(job, images) { started = new Date(); return runJob(job, images); },
        interaction: { settings: interaction.settings,
            noImages(rejected) { report.close(); return interaction.noImages(rejected); },
            present(result) {
                result.elapsed = formatDuration(new Date() - started);
                return interaction.present(result);
            }
        }
    });
}

function application() {
    const app = Application.currentApplication();
    app.includeStandardAdditions = true;
    return app;
}
module.exports = { execute, application };
