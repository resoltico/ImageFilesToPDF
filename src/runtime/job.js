"use strict";

const { calculatePageGeometry } = require("../core/geometry.js");
const { createWorkspace, removeWorkspace } = require("./workspace.js");
const { createCombinedPdf, createSeparatePdfs } = require("./pdf.js");

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
        unpublished: new Set()
    };
}

function runJob(job, imageFiles) {
    const create = job.settings.mode === "separate"
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

module.exports = { createJob, runJob };
