"use strict";

const { errorMessage } = require("../core/errors.js");
const { dirname } = require("../core/paths.js");
const {
    outputNameForCombined,
    outputNameForSeparate,
    nextUniquePath,
    stagedPdfPath
} = require("../core/naming.js");
const {
    buildPdfcpuImportArgv,
    buildPdfcpuValidateArgv
} = require("../core/commands.js");
const {
    runArgv,
    fileExists,
    verifyFileWritten,
    removeFile
} = require("./shell.js");
const { publishPdf } = require("./publish.js");
const { nonce } = require("./workspace.js");
const { preparePage, preparePages, withImageName } = require("./pages.js");

/*
 * PDF creation, validation, and publication.
 */

function createAndValidatePdf(job, stagedPath, pagePaths) {
    removeFile(job.app, stagedPath);
    runArgv(
        job.app,
        buildPdfcpuImportArgv(
            job.tools.pdfcpu,
            stagedPath,
            pagePaths,
            job.geometry
        ),
        "creating PDF"
    );
    verifyFileWritten(job.app, stagedPath, "partial PDF");
    runArgv(
        job.app,
        buildPdfcpuValidateArgv(job.tools.pdfcpu, stagedPath),
        "validating PDF"
    );
}

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
        dirname(imageFiles[0].path),
        outputNameForCombined(job.timestamp)
    );

    try {
        createAndValidatePdf(job, stagedPath, preparePages(job, imageFiles));
        publishPdf(job.app, stagedPath, finalPath);

        return { outputs: [finalPath], failures: [] };
    } catch (error) {
        removeFile(job.app, stagedPath);
        throw error;
    }
}

/*
 * One failing image must not abandon the rest, so each is reported and the
 * run continues.
 */
function createSeparatePdf(job, imageFile, index) {
    const { finalPath, stagedPath } = resolveOutputPaths(
        job,
        dirname(imageFile.path),
        outputNameForSeparate(imageFile, job.timestamp)
    );

    try {
        withImageName(imageFile, () => {
            createAndValidatePdf(job, stagedPath, [
                preparePage(job, imageFile, index)
            ]);
            publishPdf(job.app, stagedPath, finalPath);
        });

        return { output: finalPath, failure: "" };
    } catch (error) {
        removeFile(job.app, stagedPath);

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
    createAndValidatePdf,
    createCombinedPdf,
    createSeparatePdfs
};
