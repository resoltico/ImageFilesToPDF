"use strict";
const { message } = require("../core/messages.js");
const { registerArtifact } = require("../core/artifacts.js");
const { buildPdfcpuMergeArgv } = require("../backend/pdfcpu.js");
const { mergeGroups } = require("../backend/merging.js");
const { removeOwned, requireReleasedResources } = require("./owned-cleanup.js");

async function mergeParts(job, output, inputs) {
    const { toolPath } = job.operations;
    await job.operations.run(buildPdfcpuMergeArgv(job.tools.pdfcpu, toolPath(output), inputs.map(toolPath)), message("operationAssemblingPdf"));
    job.operations.verifyFile(output, message("artifactAssembledPdf"));
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
        job.progress.phase(message("progressAssemblingPdf"));
        const prefix = `${staged}.merge-${level}`;
        const groups = mergeGroups(job.tools.pdfcpu, `${prefix}-${parts.length}.pdf`, parts, job.operations);
        if (groups.length === 1) {
            await mergeParts(job, staged, parts);
            job.parts.delete(staged);
            return;
        }
        if (groups.length >= parts.length) { throw new Error(message("pdfMergeNotReduced")); }
        const merged = [];
        for (const [index, group] of groups.entries()) {
            const path = `${prefix}-${index}.pdf`;
            registerArtifact(job.artifacts, path);
            await mergeParts(job, path, group);
            merged.push(path);
        }
        parts = merged;
        level += 1;
    }
    throw new Error(message("pdfPagesMissing"));
}
module.exports = { assemblePdf };
