"use strict";
const { message } = require("../core/messages.js");
const { formatDuration } = require("../core/formatting.js");
const { OperationError } = require("../core/errors.js");
const { executeRun } = require("./run.js");
const { inspectCandidates } = require("./source-inspection.js");
const { collectImageFiles } = require("./admission.js");
const { makeTimestamp } = require("../core/timestamps.js");
const { createJob, unitsOf, runJob } = require("./job.js");

async function prepare(input, options) {
    const { interaction, operations } = options;
    const { progress } = interaction;
    progress.phase("Checking required tools");
    const tools = await options.checkTools();
    const invocation = interaction.collect(input);
    const capabilities = typeof options.capabilities === "function" ? options.capabilities() : options.capabilities;
    const { tree, sources, publication, storage, destinationNames } = capabilities;
    if (!tree || !sources || !publication || !storage || !destinationNames || typeof destinationNames.groups !== "function" ||
        ["facts", "readable", "capture", "pngCount"].some((method) => typeof sources[method] !== "function")) {
        throw new OperationError(message("filesystemCapabilitiesUnavailable"));
    }
    progress.diagnostics.push(...options.reclaim(storage));
    progress.phase("Finding images");
    const selected = collectImageFiles(operations, invocation.inputItems.map(operations.resolve), tree);
    const selection = await inspectCandidates(operations, selected, { tools, sources, progress });
    return { tools, invocation, ...capabilities, selection };
}

function jobFor(request, settings, options) {
    const { progress } = options.interaction;
    const job = createJob(options.operations, settings, request.invocation.timestamp || makeTimestamp(options.now()), request);
    Object.assign(job, { sources: request.sources, publication: request.publication, progress });
    const images = request.selection.images.length;
    progress.expect({ units: unitsOf(settings, images), images });
    return job;
}

function execute(input, options) {
    const { interaction } = options;
    const { progress } = interaction;
    let started = null;
    return executeRun({
        progress,
        prepare: () => prepare(input, options),
        createJob: (request, settings) => jobFor(request, settings, options),
        convert(job, images) { started = options.now(); return runJob(job, images); },
        interaction: { settings: interaction.settings,
            noImages(rejected) { progress.close(); return interaction.noImages(rejected); },
            present(result) {
                result.elapsed = formatDuration(options.now() - started);
                return interaction.present(result);
            }
        }
    });
}

module.exports = { execute };
