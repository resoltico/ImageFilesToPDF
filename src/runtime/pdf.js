"use strict";

const { plural } = require("../core/numbers.js");
const {
    outputNameForCombined,
    nextUniquePath,
    stagedPdfPath
} = require("../core/naming.js");
const { createAndValidatePdf } = require("./staging.js");
const { removeFile } = require("./shell.js");
const { pathIsTaken } = require("./asking.js");
const { publishPdf } = require("./publish.js");
const { nonce } = require("./workspace.js");
const { preparePages } = require("./pages.js");
const { checkpoint } = require("./stopping.js");

/*
 * One PDF from every image, and where the output of either mode goes.
 *
 * Both modes loop over images, and the loop is what owns a unit of work: it
 * opens one with each image it starts and closes one with each image it is
 * finished with. Nothing further down counts. Separate mode is pdf-separate.js.
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

/*
 * Every image, and then the fact that the images are behind it: what follows
 * is about the PDF, and used to be reported beside whichever image happened
 * to be prepared last.
 */
function prepareCombined(job, imageFiles) {
    const pages = preparePages(job, imageFiles);

    // The last image's own report may have carried a stop, and the loop above
    // has no further image to ask about it. Nothing has been made but pages,
    // and the workspace takes those with it.
    checkpoint(job.progress);
    job.progress.about(`${plural(pages.length, "image")} prepared`);

    return pages;
}

/*
 * Built, and then asked once more. The PDF is in the workspace, nothing is at
 * the output name, and the stages that reported "Creating PDF" and
 * "Validating PDF" are where a stop is most likely to have arrived -- so this
 * is the last place stopping costs nothing, and the last place it is offered.
 */
function buildCombined(job, paths, imageFiles) {
    createAndValidatePdf(
        job,
        paths.stagedPath,
        prepareCombined(job, imageFiles)
    );
    checkpoint(job.progress);
}

/*
 * The staged file is removed only while it is still disposable. Once
 * buildCombined returns it is a finished PDF and publication owns it, which
 * is what `validated`, set between the two, is there to say -- so the
 * checkpoint sits inside buildCombined, before the flag, where a stop still
 * takes the staged file with it.
 */
function produceCombined(job, paths, imageFiles) {
    let validated = false;

    try {
        buildCombined(job, paths, imageFiles);
        validated = true;
        publishPdf(job, paths.stagedPath, paths.finalPath);
        // The PDF is the last unit of a combined run, finished when it has
        // been published rather than when it has been built.
        job.progress.finished("Saved");
    } catch (error) {
        if (!validated) {
            removeFile(job.app, paths.stagedPath);
        }

        throw error;
    }
}

function createCombinedPdf(job, imageFiles) {
    const paths = resolveOutputPaths(
        job,
        imageFiles[0].folder,
        outputNameForCombined(job.timestamp)
    );

    produceCombined(job, paths, imageFiles);

    return { outputs: [paths.finalPath], failures: [] };
}

module.exports = { resolveOutputPaths, createCombinedPdf };
