"use strict";

const { OperationError } = require("../core/errors.js");
const { calculatePageGeometry } = require("../core/geometry.js");
const { isSeparateMode } = require("../core/settings.js");
const { createWorkspace, removeWorkspace } = require("./workspace.js");
const { createProgress } = require("./progress.js");
const { executeDocuments } = require("../application/documents.js");
const { documentPlan } = require("../core/document-plan.js");
const { runOutcome, issuesOf } = require("../core/outcomes.js");
const { registerArtifact, hasRetainedArtifacts } = require("../core/artifacts.js");
const { stagedPdfPath } = require("../core/naming.js");
const { preparePage } = require("./pages.js");
const { removeOwned, requireReleasedResources } = require("./owned-cleanup.js");
const { partPdfPath, importBatch, validatePdf } = require("./staging.js");
const { assemblePdf } = require("./assembly.js");
const { publishPdf } = require("./publish.js");
const { buildPdfcpuImportArgv } = require("../backend/pdfcpu.js");
const { commandLengthOf, COMMAND_BUDGET_BYTES } = require("../backend/batching.js");

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
function createJob(app, settings, timestamp, tools) {
    return {
        app,
        settings,
        timestamp,
        tools,
        geometry: calculatePageGeometry(settings),
        workspace: createWorkspace(app),
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
    return {
        allocate(index) {
            const artifact = registerArtifact(job.artifacts, stagedPdfPath(job.workspace, index));
            job.parts.set(artifact.path, []);
            return artifact;
        },
        beginning: (source, index, documentIndex) => job.progress.beginning(documentIndex + index + 1, source.originalName),
        prepare(source, index) {
            requireReleasedResources(job);
            const page = preparePage(job, source, index);
            const { path } = page;
            requireReleasedResources(job);
            const {size} = job.publication.facts(path);
            if (size < 0) { removeOwned(job, path); throw new OperationError("Page size is unknown."); }
            return { ...page, size, group: page.placement.relativeScale };
        },
        fits: (staged, pages, placement) => commandLengthOf(buildPdfcpuImportArgv(job.tools.pdfcpu, partPdfPath(staged, job.parts.get(staged).length), pages, { geometry: job.geometry, placement, background: job.settings.background })) <= COMMAND_BUDGET_BYTES,
        import(staged, pages, placement) {
            job.progress.phase("Creating PDF");
            importBatch(job, staged, pages, placement);
        },
        assemble: (staged) => assemblePdf(job, staged),
        validate(staged, expected) {
            requireReleasedResources(job);
            validatePdf(job, staged, expected);
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
            const removed = removeWorkspace(job.app, job.workspace);
            if (removed.state === "failed") { job.progress.diagnostics.push(removed.issue); }
        }
    } catch (error) { issues.push(...issuesOf(error, "cleanup")); }
}

function runJob(job, imageFiles) {
    const plans = documentPlan(job.settings, imageFiles, job.timestamp);
    const issues = [], records = [];
    try { executeDocuments(documentPorts(job), plans, records); }
    catch (error) { issues.push(...issuesOf(error, "execution")); }
    finally { cleanupJob(job, issues); }
    return runOutcome(records, [], issues, job.progress.diagnostics);
}

module.exports = { unitsOf, createJob, runJob };
