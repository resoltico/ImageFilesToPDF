"use strict";

const {
    errorMessage,
    commandOf,
    isUserCancelled
} = require("../core/errors.js");
const { outputNameForSeparate } = require("../core/naming.js");
const { createAndValidatePdf } = require("./staging.js");
const { removeFile } = require("./shell.js");
const { publishPdf } = require("./publish.js");
const { preparePage } = require("./pages.js");
const { resolveOutputPaths } = require("./pdf.js");

/*
 * One PDF per image, which means one failure per image rather than one for
 * the run: a photograph that cannot be converted must not take the other
 * nineteen with it.
 */

/*
 * What a failed image is, kept as a record until something displays it.
 *
 * The command that failed is carried by the innermost error and reached
 * through the cause chain. Reducing the failure to its message here threw
 * that away before the headless receipt -- the one place it is worth having
 * -- could ever see it.
 *
 * The name is this record's, and it used to be the message's as well: the
 * work below was wrapped in withImageName, which prefixes the message, so
 * every failure a person read said "photo.png: photo.png: Command failed". A
 * combined run has nowhere else to say which image it was and still wraps.
 */
function failureRecord(imageFile, error) {
    return {
        name: imageFile.originalName,
        message: errorMessage(error),
        command: commandOf(error)
    };
}

/*
 * The page this image became, removed as soon as the PDF that needed it is
 * finished with.
 *
 * A stage removes its own intermediates and the product belongs to whoever
 * asked for it, which here is one attempt. A combined run holds every page
 * until its single PDF is built and must; a separate run needs one at a time
 * and was keeping all of them until the workspace went at the end of the
 * batch. Deliberately not the rule the staged PDF follows: a validated PDF
 * that could not be published is kept for recovery, and a page is not.
 */
function convertOne(job, imageFile, index, stagedPath) {
    const pagePath = preparePage(job, imageFile, index);

    try {
        createAndValidatePdf(job, stagedPath, [pagePath]);
    } finally {
        removeFile(job.app, pagePath);
    }
}

/*
 * What a failed attempt leaves behind, and what it reports.
 *
 * A cancellation is not a property of the photograph, and recording it as one
 * says this image was at fault. Cleaned up first, then let out: the loop below
 * asks between images, so arriving here means something raised one from inside
 * an image, and the run then ends the way every other cancellation does.
 */
function failed(job, imageFile, error, staged) {
    if (!staged.validated) {
        removeFile(job.app, staged.path);
    }

    if (isUserCancelled(error)) {
        throw error;
    }

    // No output, so no output is named: tally reads the failure and nothing
    // else, and a path that does not exist is not worth inventing.
    return { failure: failureRecord(imageFile, error) };
}

function createSeparatePdf(job, imageFile, index) {
    // Naming is inside the boundary: resolving an output path can fail, and
    // outside the try that failure escapes the per-image result and abandons
    // the rest of the batch.
    const staged = { path: "", validated: false };

    try {
        const { finalPath, stagedPath } = resolveOutputPaths(
            job,
            imageFile.folder,
            outputNameForSeparate(imageFile, job.timestamp)
        );

        staged.path = stagedPath;
        convertOne(job, imageFile, index, stagedPath);
        staged.validated = true;
        publishPdf(job, stagedPath, finalPath);

        return { output: finalPath, failure: null };
    } catch (error) {
        return failed(job, imageFile, error, staged);
    }
}

/*
 * An image that has been tried is an image the run is finished with, whichever
 * way it went. The count used to move only on publication, so a run of three
 * whose second image failed stopped at two of three, and one where all three
 * failed stopped at none of three while the label read "3 of 3".
 */
function tally(job, results, outcome) {
    if (outcome.failure) {
        results.failures.push(outcome.failure);
        job.progress.finished("Failed");

        return;
    }

    results.outputs.push(outcome.output);
    job.progress.finished("Saved");
}

function createSeparatePdfs(job, imageFiles) {
    const results = { outputs: [], failures: [] };

    for (const [index, imageFile] of imageFiles.entries()) {
        /*
         * Asked between images, which is the only place stopping is safe: a
         * publication in progress owns a finished PDF and a name it has
         * claimed. What has been published by now is real and is reported.
         */
        if (job.progress.stopped()) {
            results.stopped = true;

            return results;
        }

        job.progress.beginning(index + 1, imageFile.originalName);
        tally(job, results, createSeparatePdf(job, imageFile, index));
    }

    return results;
}

module.exports = { createSeparatePdfs };
