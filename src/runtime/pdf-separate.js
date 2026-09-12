"use strict";

const { isUserCancelled, UserCancelled } = require("../core/errors.js");
const { createSeparatePdf } = require("./separate-image.js");

/*
 * One PDF per image: the loop, what it counts, and where it stops.
 *
 * What one image does is separate-image.js. This is the batch, and the batch
 * holds the one thing a stopped run must not lose -- the list of PDFs already
 * published.
 */

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

/*
 * One image, and whether the run should go on to the next.
 *
 * A cancellation raised from inside an image is neither that image's failure
 * nor this batch's ending: what has already been published is real, and
 * letting it escape from here would throw the report of it away. Anything
 * else is not this function's to catch.
 */
function carryOn(job, results, imageFile, index) {
    job.progress.beginning(index + 1, imageFile.originalName);

    try {
        tally(job, results, createSeparatePdf(job, imageFile, index));

        return true;
    } catch (error) {
        if (!isUserCancelled(error)) {
            throw error;
        }

        return false;
    }
}

/*
 * A stop that produced nothing is a cancellation like any other and says
 * nothing; a stop with something behind it is an outcome and must be
 * reported, because producing files without saying where they are is the one
 * thing this action exists to prevent.
 *
 * Nothing means nothing attempted. An image that failed still has to be
 * shown, whether or not the run was stopped afterwards.
 */
function stoppedResults(results) {
    if (results.outputs.length === 0 && results.failures.length === 0) {
        throw new UserCancelled();
    }

    results.stopped = true;

    return results;
}

function createSeparatePdfs(job, imageFiles) {
    const results = { outputs: [], failures: [] };

    for (const [index, imageFile] of imageFiles.entries()) {
        /*
         * Asked between images, which is the only place stopping is safe
         * here: a publication in progress owns a finished PDF and a name it
         * has claimed, and an image abandoned half way is not an outcome
         * anybody can act on.
         */
        if (job.progress.stopped() || !carryOn(job, results, imageFile, index)) {
            return stoppedResults(results);
        }
    }

    return results;
}

module.exports = { createSeparatePdfs };
