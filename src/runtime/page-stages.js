"use strict";

const {
    buildThumbnailArgv,
    buildFlattenArgv,
    buildGravityArgv
} = require("../core/commands.js");
const { calculatePlacement } = require("../core/geometry.js");
const { readBandCount, hasAlphaBand } = require("./source-image.js");
const { readImageSize } = require("./image-size.js");
const { runArgv } = require("./shell.js");
const { verifyFileWritten } = require("./asking.js");

/*
 * The three vips stages one image goes through on its way to being a page.
 *
 * Each writes a file and each verifies that it did: vips can exit zero having
 * produced nothing, and a stage that reports success without its output would
 * hand the next stage a file that is not there.
 */

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

function flattenIfTransparent(job, preparedPath, flattenedPath) {
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

function layOutOnPage(job, sourcePath, pagePath) {
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

module.exports = { resizeToPage, flattenIfTransparent, layOutOnPage };
