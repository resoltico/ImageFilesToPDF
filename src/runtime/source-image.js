"use strict";

const { buildPageCountArgv, hasAlphaBand } = require("../core/commands.js");
const { runArgv } = require("./shell.js");

/*
 * What can be learned about a source image before it becomes a page.
 */

function readBandCount(app, vipsheaderPath, imagePath) {
    const text = runArgv(
        app,
        [vipsheaderPath, "-f", "bands", imagePath],
        "reading image bands"
    );
    const value = parseInt(String(text).trim(), 10);

    if (!isFinite(value) || value < 1) {
        throw new Error(`vipsheader returned an invalid band count: ${text}`);
    }

    return value;
}

/*
 * The n-pages field is absent for single-page formats such as JPEG and PNG,
 * so a failed read means one page rather than an error.
 */
function readPageCount(app, vipsheaderPath, imagePath) {
    try {
        const text = runArgv(
            app,
            buildPageCountArgv(vipsheaderPath, imagePath),
            "reading the page count"
        );
        const value = parseInt(String(text).trim(), 10);

        return isFinite(value) && value > 0 ? value : 1;
    } catch {
        return 1;
    }
}

/*
 * A multi-page TIFF, HEIC or AVIF would otherwise contribute only its first
 * page, silently: vips reads page one unless asked for more, and the rest
 * simply would not appear in the PDF. Refusing is the honest answer, because
 * the file can be split and nothing is quietly lost.
 */
function assertSinglePage(job, imageFile) {
    const pages = readPageCount(job.app, job.tools.vipsheader, imageFile.path);

    if (pages > 1) {
        throw new Error(
            `contains ${pages} pages. Only single-page images are supported; ` +
            "split the file and run the action on the pages."
        );
    }
}

module.exports = {
    readBandCount,
    readPageCount,
    assertSinglePage,
    hasAlphaBand
};
