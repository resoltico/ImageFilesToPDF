"use strict";
const { OperationError } = require("../core/errors.js");

const { buildPageCountArgv, hasAlphaBand } = require("./backend-commands.js");
const { positiveIntegerFrom } = require("../core/numbers.js");
const { readImageSize } = require("./image-size.js");
const { sourceIssues } = require("../core/source-policy.js");
const { errorMessage, commandOf } = require("../core/errors.js");
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
    const value = positiveIntegerFrom(text);

    if (value === 0) {
        throw new OperationError(`vipsheader returned an invalid band count: ${text}`);
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
    const pages = positiveIntegerFrom(text);

    return pages > 0
        ? { pages }
        : { unknown: `vipsheader reported the page count as "${text}"` };
}

function readPageCount(app, vipsheaderPath, imagePath, singleWhenAbsent = false) {
    try {
        return countFrom(String(runArgv(
            app,
            buildPageCountArgv(vipsheaderPath, imagePath),
            "reading the page count"
        )).trim());
    } catch (error) {
        return singleWhenAbsent && FIELD_ABSENT.test(errorMessage(error))
            ? { pages: 1 }
            // Carried, not flattened: the command that failed is on the error
            // and the message alone does not have it.
            : { unknown: errorMessage(error), cause: error };
    }
}

/*
 * A multi-page TIFF, HEIC or AVIF would otherwise contribute only its first
 * page, silently: vips reads page one unless asked for more, and the rest
 * simply would not appear in the PDF. Refusing is the honest answer, because
 * the file can be split and nothing is quietly lost.
 */
const LOADERS = {
    jpegload: "JPEG", pngload: "PNG", tiffload: "TIFF", heifload: "HEIF", webpload: "WebP"
};

function admittedDescriptor(descriptor, diagnostic) {
    const issues = sourceIssues(descriptor);
    if (issues.length > 0) {
        const error = new OperationError(issues.map((issue) => issue.message).join("\n"));
        error.issues = issues.map((issue) => diagnostic ? { ...issue, diagnostic } : issue);
        throw error;
    }
    return descriptor;
}

function inspectSource(job, owned) {
    const metadata = String(runArgv(job.app,
        [job.tools.vipsheader, "-a", owned.path], "inspecting source format"));
    const loader = /^vips-loader:\s*(?<loader>\w+)\s*$/mu.exec(metadata);
    const format = loader ? LOADERS[loader.groups.loader.replace(/_buffer$/u, "")] : undefined;
    const count = format === "PNG" ? { pages: job.sources.pngCount(owned.path) }
        : readPageCount(job.app, job.tools.vipsheader, owned.path, ["JPEG", "TIFF", "HEIF", "WebP"].includes(format));
    const descriptor = { ...owned, ...readImageSize(job.app, job.tools.vipsheader, owned.path), format, pages: count.pages,
        bands: readBandCount(job.app, job.tools.vipsheader, owned.path) };
    return admittedDescriptor(descriptor, count.unknown ? { message: count.unknown, command: commandOf(count.cause) } : null);
}


module.exports = {
    readBandCount,
    readPageCount,
    inspectSource,
    hasAlphaBand
};
