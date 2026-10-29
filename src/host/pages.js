"use strict";

const { zeroPad } = require("../core/numbers.js");
const { inspectSource } = require("./source-image.js");
const {
    resizeToPage,
    flattenIfTransparent,
    layOutOnPage
} = require("./page-stages.js");
const { removeOwned } = require("./owned-cleanup.js");

/*
 * Preparation of one source image into one page-sized JPEG.
 *
 * The invariants of a run — the app handle, the located tools, the validated
 * settings, the page geometry and the workspace — travel together as one job
 * object rather than as a long positional argument list.
 */

const PAGE_INDEX_WIDTH = 6;

function workspacePaths(job, index) {
    const prefix = `${job.workspace}/${zeroPad(index + 1, PAGE_INDEX_WIDTH)}`;

    return {
        preparedPath: `${prefix}-prepared.v`,
        flattenedPath: `${prefix}-flattened.v`,
        pagePath: `${prefix}-page.jpg`
    };
}

/*
 * The three vips stages one image goes through, in order, each writing a file
 * and each verifying that it did.
 */
function renderPage(job, imageFile, paths) {
    resizeToPage(job, imageFile, paths.preparedPath);

    const sourcePath = flattenIfTransparent(
        job,
        paths.preparedPath,
        paths.flattenedPath
    );

    layOutOnPage(job, sourcePath, paths.pagePath);
}

function sweepUp(job, paths, keeping) {
    removeOwned(job, paths.preparedPath);
    removeOwned(job, paths.flattenedPath);

    if (!keeping) {
        removeOwned(job, paths.pagePath);
    }
}

// A page, or nothing left behind.
function preparePage(job, imageFile, index) {
    const paths = workspacePaths(job, index);
    let made = false;

    try {
        const captured = job.sources.capture(imageFile.path, `${job.workspace}/input-${index}`);
        const descriptor = inspectSource(job, captured);
        renderPage(job, { ...imageFile, path: captured.path, descriptor }, paths);
        made = true;

        return paths.pagePath;
    } finally {
        removeOwned(job, `${job.workspace}/input-${index}`);
        sweepUp(job, paths, made);
    }
}

module.exports = { preparePage };
