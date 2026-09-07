"use strict";

const { errorMessage } = require("../core/errors.js");
const {
    outputNameForCombined,
    outputNameForSeparate,
    nextUniquePath,
    stagedPdfPath
} = require("../core/naming.js");
const { createAndValidatePdf } = require("./staging.js");
const { fileExists, removeFile } = require("./shell.js");
const { publishPdf } = require("./publish.js");
const { nonce } = require("./workspace.js");
const { preparePage, preparePages, withImageName } = require("./pages.js");

/*
 * PDF creation, validation, and publication.
 */

function resolveOutputPaths(job, outputFolder, name) {
    const finalPath = nextUniquePath(
        outputFolder + name,
        (candidate) => fileExists(job.app, candidate)
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

        return { output: finalPath, failure: "" };
    } catch (error) {
        if (!validated) {
            removeFile(job.app, stagedPath);
        }

        return { output: "", failure: errorMessage(error) };
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
