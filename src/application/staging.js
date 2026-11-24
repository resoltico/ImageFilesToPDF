"use strict";
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

function importBatch(job, stagedPath, pages, placement) {
    const parts = job.parts.get(stagedPath);
    const path = partPdfPath(stagedPath, parts.length);
    registerArtifact(job.artifacts, path);
    job.operations.run(buildPdfcpuImportArgv(job.tools.pdfcpu, path, pages,
        { geometry: job.geometry, placement, background: job.settings.background }), "creating PDF pages");
    job.operations.verifyFile(path, "PDF pages");
    parts.push(path);
}

/*
 * Structural validity does not establish page completeness. Every import,
 * including a single-page or single-batch import, must contain exactly the
 * prepared pages before publication can claim an output filename.
 */
function verifyEveryPageArrived(job, stagedPath, expected) {
    const found = readPageCountFrom(job.operations.run(
        buildPdfcpuInfoArgv(job.tools.pdfcpu, stagedPath),
        "counting the pages"
    ));

    if (found === 0) {
        throw new OperationError("the PDF page count could not be verified");
    }

    if (found !== expected) {
        throw new OperationError(
            `the PDF has ${found} pages where ${expected} were imported`
        );
    }
}

function validatePdf(job, stagedPath, expected) {
    job.operations.verifyFile(stagedPath, "partial PDF");
    verifyEveryPageArrived(job, stagedPath, expected);
    job.progress.phase("Validating PDF");
    job.operations.run(buildPdfcpuValidateArgv(job.tools.pdfcpu, stagedPath), "validating PDF");
}

module.exports = { partPdfPath, importBatch, validatePdf };
