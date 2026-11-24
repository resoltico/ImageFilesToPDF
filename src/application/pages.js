"use strict";
const { message } = require("../core/messages.js");
const { SUPPORTED_FORMATS } = require("../core/formats.js");
const { issuesOf, ISSUE } = require("../core/outcomes.js");
const { OperationError, isUserCanceled } = require("../core/errors.js");
const { calculatePlacement, canPassThrough } = require("../core/geometry.js");
const { inspectCaptured } = require("./source-inspection.js");
const { sourceIssue, matchesAdmission, changedSourceIssue } = require("../core/source-policy.js");
const { buildThumbnailArgv, buildFlattenArgv, buildDecodeArgv, hasAlphaBand } = require("../backend/commands.js");
const { removeOwned } = require("./owned-cleanup.js");

async function normalizeImage(job, captured, source, page) {
    const { path, placement } = page;
    const intermediate = path.endsWith(".png") && hasAlphaBand(source.bands, source.interpretation);
    const prepared = `${path}.v`;
    const { toolPath } = job.operations;
    try {
        await job.operations.run(buildThumbnailArgv(job.tools.vips, toolPath(captured.path), toolPath(intermediate ? prepared : path),
            { placement, source, intermediate, background: job.settings.background, quality: job.settings.quality }), "normalizing the image");
        if (intermediate) {
            await job.operations.run(buildFlattenArgv(job.tools.vips, toolPath(prepared), toolPath(path), job.settings.background), "flattening transparency");
        }
        job.operations.verifyFile(path, "prepared image");
    } finally { if (intermediate) { removeOwned(job, prepared); } }
}

function damaged(error, path) {
    const issue = { ...sourceIssue("damaged", {}, { message: error.diagnostic?.message ?? error.message, command: error.command ?? "" }), stage: "preparation", source: path };
    const failure = new OperationError(message("fileIssue", { path, reason: issue.message }), { cause: error, issues: [issue] });
    return failure;
}

function requireAdmission(imageFile, captured) {
    if (!matchesAdmission(imageFile.admission, captured)) {
        const issue = changedSourceIssue(imageFile.path, { admitted: imageFile.admission, captured });
        const failure = new OperationError(message("fileIssue", { path: imageFile.path, reason: issue.message }), { issues: [issue] });
        throw failure;
    }
}

/** Capture, inspect and render identical owned bytes; the queue then owns the result. */
async function preparePage(job, imageFile, index) {
    if (!imageFile.admission) { throw new TypeError("Source admission facts are required before capture."); }
    const capturedPath = `${job.workspace}/input-${index}`;
    let made = false, pagePath = "";
    try {
        const captured = await job.sources.capture(imageFile.path, capturedPath);
        const source = await inspectCaptured(job, captured, imageFile.path);
        requireAdmission(imageFile, source);
        const placement = calculatePlacement(job.geometry, source);
        const pass = canPassThrough(source, placement);
        const extension = SUPPORTED_FORMATS.find((format) => format.family === source.format).pageEncoding === "jpeg" ? "jpg" : "png";
        pagePath = `${job.workspace}/${index}-page.${extension}`;
        try {
            if (pass) {
                await job.operations.run(buildDecodeArgv(job.tools.vips, job.operations.toolPath(captured.path)), "checking image data");
                await job.sources.capture(captured.path, pagePath);
            } else { await normalizeImage(job, captured, source, { path: pagePath, placement }); }
        } catch (error) { if (isUserCanceled(error) || issuesOf(error, "preparation")[0].code === ISSUE.fault) { throw error; } throw damaged(error, imageFile.path); }
        made = true;
        return { path: pagePath, placement };
    } finally {
        removeOwned(job, capturedPath);
        if (!made && pagePath) { removeOwned(job, pagePath); }
    }
}
module.exports = { preparePage };
