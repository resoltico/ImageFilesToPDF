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

async function checkDecode(job, captured, pass) {
    if (!pass) { return; }
    await job.operations.run(buildDecodeArgv(job.tools.vips, job.operations.toolPath(captured.path)), "checking image data");
}

function preparationFailure(error, imageFile) {
    if (isUserCanceled(error) || issuesOf(error, "preparation")[0].code === ISSUE.fault) { throw error; }
    throw damaged(error, imageFile.path);
}

async function inspectInput(job, imageFile, capturedPath) {
    if (!imageFile.admission) { throw new TypeError("Source admission facts are required before capture."); }
    const captured = await job.sources.capture(imageFile.path, capturedPath);
    const source = await inspectCaptured(job, captured, imageFile.path);
    requireAdmission(imageFile, source);
    const placement = calculatePlacement(job.geometry, source);
    const pass = canPassThrough(source, placement);
    try { await checkDecode(job, captured, pass); }
    catch (error) { preparationFailure(error, imageFile); }
    return { captured, source, placement, pass };
}

async function encodePage(job, imageFile, index, { captured, source, placement, pass }) {
    const extension = SUPPORTED_FORMATS.find((format) => format.family === source.format).pageEncoding === "jpeg" ? "jpg" : "png";
    const path = `${job.workspace}/${index}-page.${extension}`;
    try {
        if (pass) { await job.sources.capture(captured.path, path); }
        else { await normalizeImage(job, captured, source, { path, placement }); }
        return { path, placement };
    } catch (error) {
        removeOwned(job, path);
        return preparationFailure(error, imageFile);
    }
}

/** Captures may overlap. Only the ordered consumer creates encoded pages. */
function beginPagePreparation(job, imageFile, index) {
    const capturedPath = `${job.workspace}/input-${index}`;
    let closed = false;
    return {
        ready: inspectInput(job, imageFile, capturedPath),
        finish: (facts) => encodePage(job, imageFile, index, facts),
        close() {
            if (!closed) { closed = true; removeOwned(job, capturedPath); }
        }
    };
}

module.exports = { beginPagePreparation };
