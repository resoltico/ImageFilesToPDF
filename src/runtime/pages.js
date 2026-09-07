"use strict";

const { zeroPad } = require("../core/numbers.js");
const { errorMessage } = require("../core/errors.js");
const {
    buildThumbnailArgv,
    buildFlattenArgv,
    buildGravityArgv
} = require("../core/commands.js");
const { calculatePlacement } = require("../core/geometry.js");
const {
    readImageSize,
    readBandCount,
    assertSinglePage,
    hasAlphaBand
} = require("./source-image.js");
const { runArgv, verifyFileWritten, removeFile } = require("./shell.js");

/*
 * Preparation of one source image into one page-sized JPEG.
 *
 * The invariants of a run — the app handle, the located tools, the validated
 * settings, the page geometry and the workspace — travel together as one job
 * object rather than as a long positional argument list.
 */

const PAGE_INDEX_WIDTH = 6;

/*
 * One stage resizes and converts to sRGB. The thumbnail operation applies the
 * embedded ICC profile, which a separate colourspace stage would ignore, and
 * it saves an intermediate write and read of a full-page uncompressed image.
 */
function resizeToPage(job, imageFile, preparedPath) {
    const placement = calculatePlacement(
        job.geometry,
        readImageSize(job.app, job.tools.vipsheader, imageFile.path)
    );

    runArgv(
        job.app,
        buildThumbnailArgv(
            job.tools.vips,
            imageFile.path,
            preparedPath,
            placement
        ),
        "preparing the image"
    );
    verifyFileWritten(job.app, preparedPath, "prepared image");
}

function flattenIfTransparent(job, imageFile, preparedPath, flattenedPath) {
    const bands = readBandCount(job.app, job.tools.vipsheader, preparedPath);

    if (!hasAlphaBand(bands)) {
        return preparedPath;
    }

    runArgv(
        job.app,
        buildFlattenArgv(
            job.tools.vips,
            preparedPath,
            flattenedPath,
            job.settings.background
        ),
        "flattening the image"
    );
    verifyFileWritten(job.app, flattenedPath, "flattened image");

    return flattenedPath;
}

function layOutOnPage(job, imageFile, sourcePath, pagePath) {
    runArgv(
        job.app,
        buildGravityArgv(job.tools.vips, sourcePath, pagePath, {
            geometry: job.geometry,
            quality: job.settings.quality,
            background: job.settings.background
        }),
        "laying out the page"
    );
    verifyFileWritten(job.app, pagePath, "prepared page image");
}

function workspacePaths(job, index) {
    const prefix = `${job.workspace}/${zeroPad(index + 1, PAGE_INDEX_WIDTH)}`;

    return {
        preparedPath: `${prefix}-prepared.v`,
        flattenedPath: `${prefix}-flattened.v`,
        pagePath: `${prefix}-page.jpg`
    };
}

function preparePage(job, imageFile, index) {
    job.progress.file(index + 1, imageFile.originalName);

    const { preparedPath, flattenedPath, pagePath } = workspacePaths(job, index);

    assertSinglePage(job, imageFile);

    try {
        resizeToPage(job, imageFile, preparedPath);

        const sourcePath = flattenIfTransparent(
            job,
            imageFile,
            preparedPath,
            flattenedPath
        );

        layOutOnPage(job, imageFile, sourcePath, pagePath);

        return pagePath;
    } finally {
        removeFile(job.app, preparedPath);
        removeFile(job.app, flattenedPath);
    }
}

/*
 * Names the image once. A combined run has no other place to say which one
 * failed, and a separate run does the same at its own boundary, so the name
 * appears exactly once either way.
 */
function withImageName(imageFile, produce) {
    try {
        return produce();
    } catch (error) {
        throw new Error(`${imageFile.originalName}: ${errorMessage(error)}`, {
            cause: error
        });
    }
}

function preparePages(job, imageFiles) {
    return imageFiles.map((imageFile, index) =>
        withImageName(imageFile, () => preparePage(job, imageFile, index)));
}

module.exports = { preparePage, preparePages, withImageName };
