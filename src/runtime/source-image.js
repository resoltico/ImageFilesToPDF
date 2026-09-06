"use strict";

const { buildPageCountArgv, hasAlphaBand } = require("../core/commands.js");
const { errorMessage } = require("../core/errors.js");
const { runArgv } = require("./shell.js");

/*
 * What can be learned about a source image before it becomes a page.
 */

function readField(app, vipsheaderPath, imagePath, field) {
    const text = runArgv(
        app,
        [vipsheaderPath, "-f", field, imagePath],
        `reading the image ${field}`
    );
    const value = parseInt(String(text).trim(), 10);

    if (!isFinite(value) || value < 1) {
        throw new Error(`vipsheader returned an invalid ${field}: ${text}`);
    }

    return value;
}

/*
 * The pixel dimensions of the source, which decide how large it sits on the
 * page. Read rather than inferred: the placement is meaningless without them.
 */
function readImageSize(app, vipsheaderPath, imagePath) {
    return {
        width: readField(app, vipsheaderPath, imagePath, "width"),
        height: readField(app, vipsheaderPath, imagePath, "height")
    };
}

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
 * How many pages the file has, or why that is not known.
 *
 * A single-page format such as JPEG or PNG carries no n-pages field at all,
 * and vipsheader says so precisely: the image loaded and the field is simply
 * absent. That is the one failure which genuinely means one page. Every other
 * failure — the file would not load, the tool is missing, the output is not a
 * number — means the count is unknown, and returning 1 for those would let a
 * multi-page file through the very check that exists to refuse it.
 */
const FIELD_ABSENT = /field "n-pages" not found/u;

function countFrom(text) {
    // Parsed strictly: parseInt would read "2junk" as two.
    return /^\d+$/u.test(text) && Number(text) > 0
        ? { pages: Number(text) }
        : { unknown: `vipsheader reported the page count as "${text}"` };
}

function readPageCount(app, vipsheaderPath, imagePath) {
    try {
        return countFrom(String(runArgv(
            app,
            buildPageCountArgv(vipsheaderPath, imagePath),
            "reading the page count"
        )).trim());
    } catch (error) {
        return FIELD_ABSENT.test(errorMessage(error))
            ? { pages: 1 }
            : { unknown: errorMessage(error) };
    }
}

/*
 * A multi-page TIFF, HEIC or AVIF would otherwise contribute only its first
 * page, silently: vips reads page one unless asked for more, and the rest
 * simply would not appear in the PDF. Refusing is the honest answer, because
 * the file can be split and nothing is quietly lost.
 */
function assertSinglePage(job, imageFile) {
    const count = readPageCount(job.app, job.tools.vipsheader, imageFile.path);

    if (count.unknown) {
        throw new Error(
            "could not be checked for multiple pages, which this action " +
            `refuses to convert:\n\n${count.unknown}`
        );
    }

    if (count.pages > 1) {
        throw new Error(
            `contains ${count.pages} pages. Only single-page images are ` +
            "supported; split the file and run the action on the pages."
        );
    }
}

module.exports = {
    readImageSize,
    readBandCount,
    readPageCount,
    assertSinglePage,
    hasAlphaBand
};
