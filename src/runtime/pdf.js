"use strict";

const { errorMessage, commandOf } = require("../core/errors.js");
const {
    outputNameForCombined,
    outputNameForSeparate,
    nextUniquePath,
    stagedPdfPath
} = require("../core/naming.js");
const { createAndValidatePdf } = require("./staging.js");
const { pathIsTaken, removeFile } = require("./shell.js");
const { publishPdf } = require("./publish.js");
const { nonce } = require("./workspace.js");
const { preparePage, preparePages, withImageName } = require("./pages.js");

/*
 * PDF creation, validation, and publication.
 */

function resolveOutputPaths(job, outputFolder, name) {
    // Any entry at all counts as taken, including a link whose target is
    // gone: something is there, and the name cannot be created over it.
    const finalPath = nextUniquePath(
        outputFolder + name,
        (candidate) => pathIsTaken(job.app, candidate)
    );

    return { finalPath, stagedPath: stagedPdfPath(job.workspace, nonce()) };
}

function createCombinedPdf(job, imageFiles) {
    const { finalPath, stagedPath } = resolveOutputPaths(
        job,
        imageFiles[0].folder,
        outputNameForCombined(job.timestamp)
    );

    // Removed only while it is still disposable. Once createAndValidatePdf
    // returns, the staged file is a finished PDF and publication owns it.
    let validated = false;

    try {
        createAndValidatePdf(job, stagedPath, preparePages(job, imageFiles));
        // Set between the two: from here the staged file is a finished PDF
        // and publication owns it, so a failure must not delete it.
        validated = true;
        publishPdf(job, stagedPath, finalPath);

        return { outputs: [finalPath], failures: [] };
    } catch (error) {
        if (!validated) {
            removeFile(job.app, stagedPath);
        }

        throw error;
    }
}

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

/*
 * One failing image must not abandon the rest, so each is reported and the
 * run continues.
 */
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

        return { output: "", failure: failureRecord(imageFile, error) };
    }
}

function createSeparatePdfs(job, imageFiles) {
    const outputs = [];
    const failures = [];

    imageFiles.forEach((imageFile, index) => {
        const { output, failure } = createSeparatePdf(job, imageFile, index);

        if (failure) {
            failures.push(failure);
        } else {
            outputs.push(output);
        }
    });

    return { outputs, failures };
}

module.exports = {
    createCombinedPdf,
    createSeparatePdfs
};
