"use strict";
const { registerArtifact } = require("../core/artifacts.js");
const { buildPdfcpuMergeArgv } = require("../backend/pdfcpu.js");
const { mergeGroups } = require("../backend/merging.js");
const { runArgv } = require("./shell.js");
const { verifyFileWritten } = require("./asking.js");
const { removeOwned, requireReleasedResources } = require("./owned-cleanup.js");

function mergeParts(job, output, inputs) {
    runArgv(job.app, buildPdfcpuMergeArgv(job.tools.pdfcpu, output, inputs), "assembling PDF");
    verifyFileWritten(job.app, output, "assembled PDF");
    for (const input of inputs) {
        removeOwned(job, input);
        requireReleasedResources(job);
        job.artifacts.delete(input);
    }
}

/** Bounded merge levels avoid rewriting the entire growing document for each append. */
function assemblePdf(job, staged) {
    let parts = job.parts.get(staged);
    let level = 0;
    while (parts.length > 0) {
        job.progress.phase("Assembling PDF");
        const prefix = `${staged}.merge-${level}`;
        const groups = mergeGroups(job.tools.pdfcpu, `${prefix}-${parts.length}.pdf`, parts);
        if (groups.length === 1) { mergeParts(job, staged, parts); job.parts.delete(staged); return; }
        if (groups.length >= parts.length) { throw new Error("PDF merge could not reduce the input groups."); }
        parts = groups.map((group, index) => {
            const path = `${prefix}-${index}.pdf`;
            registerArtifact(job.artifacts, path);
            mergeParts(job, path, group);
            return path;
        });
        level += 1;
    }
    throw new Error("No PDF pages were prepared.");
}
module.exports = { assemblePdf };
