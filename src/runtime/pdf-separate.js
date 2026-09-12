"use strict";

const { errorMessage, commandOf } = require("../core/errors.js");
const { outputNameForSeparate } = require("../core/naming.js");
const { createAndValidatePdf } = require("./staging.js");
const { removeFile } = require("./shell.js");
const { publishPdf } = require("./publish.js");
const { preparePage, withImageName } = require("./pages.js");
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
 */
function failureRecord(imageFile, error) {
    return {
        name: imageFile.originalName,
        message: errorMessage(error),
        command: commandOf(error)
    };
}

function createSeparatePdf(job, imageFile, index) {
    // Naming is inside the boundary: resolving an output path can fail, and
    // outside the try that failure escapes the per-image result and abandons
    // the rest of the batch.
    let stagedPath = "";
    let validated = false;

    try {
        const { finalPath, stagedPath: staged } = resolveOutputPaths(
            job,
            imageFile.folder,
            outputNameForSeparate(imageFile, job.timestamp)
        );

        stagedPath = staged;

        withImageName(imageFile, () => {
            createAndValidatePdf(job, stagedPath, [
                preparePage(job, imageFile, index)
            ]);
            validated = true;
            publishPdf(job, stagedPath, finalPath);
        });

        return { output: finalPath, failure: null };
    } catch (error) {
        if (!validated) {
            removeFile(job.app, stagedPath);
        }

        // No output, so no output is named: tally reads the failure and
        // nothing else, and a path that does not exist is not worth inventing.
        return { failure: failureRecord(imageFile, error) };
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

    imageFiles.forEach((imageFile, index) => {
        job.progress.beginning(index + 1, imageFile.originalName);
        tally(job, results, createSeparatePdf(job, imageFile, index));
    });

    return results;
}

module.exports = { createSeparatePdfs };
