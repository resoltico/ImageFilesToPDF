"use strict";
const { message } = require("../core/messages.js");

const { OperationError } = require("../core/errors.js");
const { calculatePageGeometry } = require("../core/geometry.js");
const { isSeparateMode } = require("../core/settings.js");
const { retainCandidate, clearRetention } = require("./workspace.js");
const { createProgress } = require("./progress.js");
const { executeDocuments } = require("./documents.js");
const { documentPlan } = require("../core/document-plan.js");
const { runOutcome, issuesOf } = require("../core/outcomes.js");
const { registerArtifact, hasRetainedArtifacts } = require("../core/artifacts.js");
const { stagedPdfPath } = require("../core/naming.js");
const { beginPagePreparation } = require("./pages.js");
const { removeOwned, requireReleasedResources } = require("./owned-cleanup.js");
const { partPdfPath, importBatch, validatePdf } = require("./staging.js");
const { assemblePdf } = require("./assembly.js");
const { publishPdf } = require("./publish.js");
const { buildPdfcpuImportArgv } = require("../backend/pdfcpu.js");

/*
 * Assembling a run and carrying it out, which is a separate job from deciding
 * what to run and reporting it: main.js does that.
 */

/*
 * What this run has to finish. Separate mode publishes one PDF per image, so
 * an image is a unit of work; combined mode prepares every image and then
 * publishes one PDF, which is a unit of its own -- and counting only the
 * images made a combined run report more finished work than it had.
 */
function unitsOf(settings, images) {
    return isSeparateMode(settings) ? images : images + 1;
}

/*
 * The invariants of a run, gathered once and passed as a unit.
 */
async function createJob(operations, settings, timestamp, environment) {
    const { tools, storage, destinationNames } = environment;
    return {
        operations,
        settings,
        timestamp,
        tools,
        geometry: calculatePageGeometry(settings),
        workspace: await operations.createWorkspace(storage),
        storage,
        destinationNames,
        // Authoritative artifact lifecycles, registered before PDF bytes exist.
        artifacts: new Map(),
        parts: new Map(),
        cleanupIssues: [],
        // Reports nowhere until the composition root supplies run progress.
        progress: createProgress([]),
        // Native publication operations come from the composition root.
        // Their bridge belongs to the run rather than to the job's shape.
        publication: null
    };
}

function documentPorts(job) {
    const { toolPath } = job.operations;
    return {
        allocate(index) {
            const artifact = registerArtifact(job.artifacts, stagedPdfPath(job.workspace, index));
            job.parts.set(artifact.path, []);
            return artifact;
        },
        beginning: (source, index, documentIndex) => job.progress.beginning(documentIndex + index + 1, source.originalName),
        parallelism: job.operations.preparationConcurrency,
        capture(source, index) {
            requireReleasedResources(job);
            return beginPagePreparation(job, source, index);
        },
        async prepare(unusedSource, unusedIndex, work, facts) {
            job.operations.checkpoint();
            const page = await work.finish(facts).finally(work.close);
            const { path } = page;
            requireReleasedResources(job);
            const { size } = job.publication.facts(path);
            if (size <= 0) { removeOwned(job, path); throw new OperationError(message("pageSizeUnknown")); }
            return { ...page, size, group: page.placement.relativeScale };
        },
        fits: (staged, pages, placement) => job.operations.fits(buildPdfcpuImportArgv(job.tools.pdfcpu, toolPath(partPdfPath(staged, job.parts.get(staged).length)), pages.map(toolPath), { geometry: job.geometry, placement, background: job.settings.background })),
        import(staged, pages, placement) {
            job.progress.about("");
            job.progress.phase("Creating PDF");
            return importBatch(job, staged, pages, placement);
        },
        assemble(staged) { job.progress.about(""); return assemblePdf(job, staged); },
        beforeValidation: () => retainCandidate(job),
        validate(staged, expected) {
            requireReleasedResources(job);
            return validatePdf(job, staged, expected);
        },
        publish: (staged, destination) => publishPdf(job, staged, destination),
        remove: (path) => removeOwned(job, path),
        prepared: () => { if (!isSeparateMode(job.settings)) { job.progress.finished("Preparing"); } },
        completed: (record) => job.progress.finished(record.state === "saved" ? "Saved" : "Finished")
    };
 }

function cleanupJob(job, issues) {
    job.progress.diagnostics.push(...job.cleanupIssues);
    try {
        if (!hasRetainedArtifacts(job.artifacts)) {
            clearRetention(job);
            const removed = job.operations.removeWorkspace(job.workspace);
            if (removed.state === "failed") { job.progress.diagnostics.push(removed.issue); }
        }
    } catch (error) { issues.push(...issuesOf(error, "cleanup")); }
}

async function runJob(job, imageFiles) {
    const issues = [], records = [];
    try {
        const groups = isSeparateMode(job.settings) ? job.destinationNames.groups(imageFiles, job.workspace) : [];
        const plans = documentPlan(job.settings, imageFiles, job.timestamp, { nameGroups: groups, separateName: job.operations.outputName });
        await executeDocuments(documentPorts(job), plans, records);
    }
    catch (error) { issues.push(...issuesOf(error, "execution")); }
    finally { cleanupJob(job, issues); }
    return runOutcome(records, [], issues, job.progress.diagnostics);
}

module.exports = { unitsOf, createJob, runJob };
