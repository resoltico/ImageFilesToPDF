"use strict";
const { issuesOf, ISSUE } = require("../core/outcomes.js");
const { OperationError, isUserCancelled } = require("../core/errors.js");
const { calculatePlacement, canPassThrough } = require("../core/geometry.js");
const { inspectCaptured } = require("./source-inspection.js");
const { sourceIssue, matchesAdmission, changedSourceIssue } = require("../core/source-policy.js");
const { buildThumbnailArgv, buildFlattenArgv, buildDecodeArgv, hasAlphaBand } = require("../backend/commands.js");
const { runArgv } = require("./shell.js");
const { verifyFileWritten } = require("./asking.js");
const { removeOwned } = require("./owned-cleanup.js");

function normalizeImage(job, captured, source, page) {
    const { path, placement } = page;
    const intermediate = path.endsWith(".png") && hasAlphaBand(source.bands, source.interpretation);
    const prepared = `${path}.v`;
    try {
        runArgv(job.app, buildThumbnailArgv(job.tools.vips, captured.path, intermediate ? prepared : path,
            { placement, source, intermediate, background: job.settings.background, quality: job.settings.quality }), "normalising the image");
        if (intermediate) {
            runArgv(job.app, buildFlattenArgv(job.tools.vips, prepared, path, job.settings.background), "flattening transparency");
        }
        verifyFileWritten(job.app, path, "prepared image");
    } finally { if (intermediate) { removeOwned(job, prepared); } }
}

function damaged(error, path) {
    const issue = { ...sourceIssue("damaged", {}, { message: error.message, command: error.command ?? "" }), stage: "preparation", source: path };
    const failure = new OperationError(`${path}: ${issue.message}`, { cause: error });
    failure.issues = [issue];
    return failure;
}

function requireAdmission(imageFile, captured) {
    if (!matchesAdmission(imageFile.admission, captured)) {
        const issue = changedSourceIssue(imageFile.path, { admitted: imageFile.admission, captured });
        const failure = new OperationError(`${imageFile.path}: ${issue.message}`);
        failure.issues = [issue];
        throw failure;
    }
}

/** Capture, inspect and render identical owned bytes; the queue then owns the result. */
function preparePage(job, imageFile, index) {
    if (!imageFile.admission) { throw new TypeError("Source admission facts are required before capture."); }
    const capturedPath = `${job.workspace}/input-${index}`;
    let made = false, pagePath = "";
    try {
        const captured = job.sources.capture(imageFile.path, capturedPath);
        const source = inspectCaptured(job, captured, imageFile.path);
        requireAdmission(imageFile, source);
        const placement = calculatePlacement(job.geometry, source);
        const pass = canPassThrough(source, placement);
        const extension = pass || ["JPEG", "HEIF", "WebP"].includes(source.format) ? "jpg" : "png";
        pagePath = `${job.workspace}/${index}-page.${extension}`;
        try {
            if (pass) {
                runArgv(job.app, buildDecodeArgv(job.tools.vips, captured.path), "checking image data");
                job.sources.capture(captured.path, pagePath);
            } else { normalizeImage(job, captured, source, { path: pagePath, placement }); }
        } catch (error) { if (isUserCancelled(error) || issuesOf(error, "preparation")[0].code === ISSUE.fault) { throw error; } throw damaged(error, imageFile.path); }
        made = true;
        return { path: pagePath, placement };
    } finally {
        removeOwned(job, capturedPath);
        if (!made && pagePath) { removeOwned(job, pagePath); }
    }
}
module.exports = { preparePage };
