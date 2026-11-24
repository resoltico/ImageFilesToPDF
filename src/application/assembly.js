"use strict";
const { registerArtifact } = require("../core/artifacts.js");
const { buildPdfcpuMergeArgv } = require("../backend/pdfcpu.js");
const { mergeGroups } = require("../backend/merging.js");
const { removeOwned, requireReleasedResources } = require("./owned-cleanup.js");

async function mergeParts(job, output, inputs) {
    await job.operations.run(buildPdfcpuMergeArgv(job.tools.pdfcpu, output, inputs), "assembling PDF");
    job.operations.verifyFile(output, "assembled PDF");
    for (const input of inputs) {
        removeOwned(job, input);
        requireReleasedResources(job);
        job.artifacts.delete(input);
    }
}

/** Bounded merge levels avoid rewriting the entire growing document for each append. */
async function assemblePdf(job, staged) {
    let parts = job.parts.get(staged);
    let level = 0;
    while (parts.length > 0) {
        job.progress.phase("Assembling PDF");
        const prefix = `${staged}.merge-${level}`;
        const groups = mergeGroups(job.tools.pdfcpu, `${prefix}-${parts.length}.pdf`, parts, job.operations.fits);
        if (groups.length === 1) {
            // eslint-disable-next-line no-await-in-loop -- Settle the final merge before the workspace is released.
            await mergeParts(job, staged, parts);
            job.parts.delete(staged);
            return;
        }
        if (groups.length >= parts.length) { throw new Error("PDF merge could not reduce the input groups."); }
        const merged = [];
        for (const [index, group] of groups.entries()) {
            const path = `${prefix}-${index}.pdf`;
            registerArtifact(job.artifacts, path);
            // eslint-disable-next-line no-await-in-loop -- Merge and release each group before the next.
            await mergeParts(job, path, group);
            merged.push(path);
        }
        parts = merged;
        level += 1;
    }
    throw new Error("No PDF pages were prepared.");
}
module.exports = { assemblePdf };
