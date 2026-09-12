"use strict";

const { calculatePageGeometry } = require("../core/geometry.js");
const { isSeparateMode } = require("../core/settings.js");
const { makeTimestamp } = require("../core/naming.js");
const { createWorkspace, removeWorkspace } = require("./workspace.js");
const { createRenamer } = require("./exclusive-rename.js");
const { settingsFor } = require("./settings-form.js");
const { unitsOf, SILENT } = require("./progress.js");
const { createCombinedPdf } = require("./pdf.js");
const { createSeparatePdfs } = require("./pdf-separate.js");

/*
 * Assembling a run and carrying it out, which is a separate job from deciding
 * what to run and reporting it: main.js does that.
 */

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
        // Validated PDFs this run has produced and not yet published.
        unpublished: new Set(),
        progress: SILENT,
        // The exclusive rename, where the host can reach it. reportingJob
        // supplies it for the same reason it supplies progress: the bridge
        // belongs to the run rather than to the job's shape.
        rename: null
    };
}

function prepareJob(app, invocation, tools, count) {
    return createJob(
        app,
        settingsFor(app, invocation, count),
        invocation.timestamp || makeTimestamp(new Date()),
        tools
    );
}

/*
 * The report belongs to the run rather than to the job: it was alive before
 * there was a job, saying which tools were being checked and which folders
 * were being read, and it outlives the job to be closed before anything is
 * displayed. What the job is given is that same object, told how much work
 * there is now that the images have been counted and the settings answered.
 */
function reportingJob(app, invocation, tools, work) {
    const images = work.images.length;
    const job = prepareJob(app, invocation, tools, images);

    job.rename = createRenamer(globalThis.ObjC, globalThis.$);
    job.progress = work.report;
    work.report.expect({ units: unitsOf(job.settings, images), images });

    return job;
}

function runJob(job, imageFiles) {
    const create = isSeparateMode(job.settings)
        ? createSeparatePdfs
        : createCombinedPdf;

    try {
        return create(job, imageFiles);
    } finally {
        // A workspace still holding a validated PDF outlives the run. It has
        // been imported and validated by then, and the message that reported
        // the failure sent the user to it.
        if (job.unpublished.size === 0) {
            removeWorkspace(job.app, job.workspace);
        }
    }
}

module.exports = { createJob, prepareJob, reportingJob, runJob };
