"use strict";

const { zeroPad } = require("../core/numbers.js");
const { errorMessage } = require("../core/errors.js");
const { assertSinglePage } = require("./source-image.js");
const {
    resizeToPage,
    flattenIfTransparent,
    layOutOnPage
} = require("./page-stages.js");
const { removeFile } = require("./shell.js");

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

function preparePage(job, imageFile, index) {
    job.progress.beginning(index + 1, imageFile.originalName);

    const { preparedPath, flattenedPath, pagePath } = workspacePaths(job, index);

    assertSinglePage(job, imageFile);

    try {
        resizeToPage(job, imageFile, preparedPath);

        const sourcePath = flattenIfTransparent(job, preparedPath, flattenedPath);

        layOutOnPage(job, sourcePath, pagePath);

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

/*
 * One unit finishes with each page prepared; the PDF made from them is the
 * last unit, and createCombinedPdf reports that one.
 */
function preparePages(job, imageFiles) {
    return imageFiles.map((imageFile, index) => {
        const page = withImageName(
            imageFile,
            () => preparePage(job, imageFile, index)
        );

        job.progress.finished("Preparing");

        return page;
    });
}

module.exports = { preparePage, preparePages, withImageName };
