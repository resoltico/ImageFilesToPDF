"use strict";
const { issuesOf, ISSUE } = require("../core/outcomes.js");
const { OperationError, isUserCancelled } = require("../core/errors.js");
const { calculatePlacement, canPassThrough } = require("../core/geometry.js");
const { inspectSource } = require("./source-image.js");
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
    const failure = new OperationError(`${path}: the image is damaged and could not be decoded.`, { cause: error });
    failure.issues = [{ code: "damaged", stage: "preparation", source: path, message: "The image is damaged and could not be decoded.",
        diagnostic: { message: error.message, command: error.command ?? "" } }];
    return failure;
}

/** Capture, inspect and render identical owned bytes; the queue then owns the result. */
function preparePage(job, imageFile, index) {
    const capturedPath = `${job.workspace}/input-${index}`;
    let pagePath = "";
    let made = false;
    try {
        const captured = job.sources.capture(imageFile.path, capturedPath);
        const source = inspectSource(job, captured);
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
