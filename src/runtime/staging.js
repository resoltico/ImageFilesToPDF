"use strict";

const {
    buildPdfcpuImportArgv,
    buildPdfcpuInfoArgv,
    readPageCountFrom,
    buildPdfcpuValidateArgv
} = require("../core/pdfcpu.js");
const { batchPages } = require("../core/batching.js");
const { runArgv, verifyFileWritten, removeFile } = require("./shell.js");

/*
 * Turning prepared pages into a PDF in the workspace, and satisfying this
 * code that the PDF is what it asked for before anybody publishes it.
 */

function importBatch(job, stagedPath, pages) {
    runArgv(
        job.app,
        buildPdfcpuImportArgv(job.tools.pdfcpu, stagedPath, pages, job.geometry),
        "creating PDF"
    );
}

/*
 * A batch that appends nothing while exiting zero is a failure mode chunking
 * introduces and a single import did not have, so when the pages were handed
 * over in more than one group the PDF is asked how many pages it ended up
 * with. One group is the ordinary case and is left alone.
 */
function verifyEveryPageArrived(job, stagedPath, expected) {
    const found = readPageCountFrom(runArgv(
        job.app,
        buildPdfcpuInfoArgv(job.tools.pdfcpu, stagedPath),
        "counting the pages"
    ));

    if (found !== expected) {
        throw new Error(
            `the PDF has ${found} pages where ${expected} were imported`
        );
    }
}

function createAndValidatePdf(job, stagedPath, pagePaths) {
    job.progress.phase("Creating PDF");
    removeFile(job.app, stagedPath);

    const batches = batchPages(
        pagePaths,
        buildPdfcpuImportArgv(
            job.tools.pdfcpu,
            stagedPath,
            pagePaths.slice(0, 1),
            job.geometry
        )
    );

    for (const pages of batches) {
        importBatch(job, stagedPath, pages);
    }

    verifyFileWritten(job.app, stagedPath, "partial PDF");

    if (batches.length > 1) {
        verifyEveryPageArrived(job, stagedPath, pagePaths.length);
    }

    job.progress.phase("Validating PDF");
    runArgv(
        job.app,
        buildPdfcpuValidateArgv(job.tools.pdfcpu, stagedPath),
        "validating PDF"
    );
}

module.exports = { createAndValidatePdf };
