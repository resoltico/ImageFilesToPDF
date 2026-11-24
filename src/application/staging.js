"use strict";
const { message } = require("../core/messages.js");
const { registerArtifact } = require("../core/artifacts.js");
const { OperationError } = require("../core/errors.js");

const {
    buildPdfcpuImportArgv,
    buildPdfcpuInfoArgv,
    readPageCountFrom,
    buildPdfcpuValidateArgv
} = require("../backend/pdfcpu.js");

/*
 * Turning prepared pages into a PDF in the workspace, and satisfying this
 * code that the PDF is what it asked for before anybody publishes it.
 */

function partPdfPath(staged, index) { return `${staged}.part-${index}.pdf`; }

async function importBatch(job, stagedPath, pages, placement) {
    const parts = job.parts.get(stagedPath);
    const path = partPdfPath(stagedPath, parts.length);
    registerArtifact(job.artifacts, path);
    const { toolPath } = job.operations;
    await job.operations.run(buildPdfcpuImportArgv(job.tools.pdfcpu, toolPath(path), pages.map(toolPath),
        { geometry: job.geometry, placement, background: job.settings.background }), "creating PDF pages");
    job.operations.verifyFile(path, "PDF pages");
    parts.push(path);
}

/*
 * Structural validity does not establish page completeness. Every import,
 * including a single-page or single-batch import, must contain exactly the
 * prepared pages before publication can claim an output filename.
 */
async function verifyEveryPageArrived(job, stagedPath, expected) {
    const found = readPageCountFrom(await job.operations.run(
        buildPdfcpuInfoArgv(job.tools.pdfcpu, job.operations.toolPath(stagedPath)),
        "counting the pages"
    ));

    if (found === 0) {
        throw new OperationError(message("pdfPageCountUnverified"));
    }

    if (found !== expected) {
        throw new OperationError(
            message("pdfPageCountMismatch", { found, expected })
        );
    }
}

async function validatePdf(job, stagedPath, expected) {
    job.operations.verifyFile(stagedPath, "partial PDF");
    await verifyEveryPageArrived(job, stagedPath, expected);
    job.progress.phase("Validating PDF");
    await job.operations.run(buildPdfcpuValidateArgv(job.tools.pdfcpu, job.operations.toolPath(stagedPath)), "validating PDF");
}

module.exports = { partPdfPath, importBatch, validatePdf };
