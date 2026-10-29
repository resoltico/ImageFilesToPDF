"use strict";

const { runOutcome } = require("../core/outcomes.js");
const { APP_NAME } = require("../core/version.js");
const { supportedFormatList } = require("../core/paths.js");
const { describeRejections, showCompletion } = require("./completion.js");
const {
    writeReceipt,
    isCompleteSuccess,
    describeIncomplete
} = require("./receipt.js");

/*
 * Nothing to convert, which is a different message depending on whether
 * anything was asked for. Selecting only a GIF is not the same as selecting
 * nothing, and saying "no images selected" to someone who selected one is how
 * a rejection becomes invisible.
 */
function describeNoImages(rejected) {
    if (rejected.length === 0) {
        return "No images selected.\n\nSelect image files or folders in " +
            `Finder, then run the action again.\n\nSupported: ${
                supportedFormatList()}.`;
    }

    return `Nothing to convert.\n\n${describeRejections(rejected)}`;
}

function reportNoImages(app, headless, rejected) {
    if (headless) {
        return runOutcome([], rejected, [{ code: "no-images", stage: "selection", message: describeNoImages(rejected) }]);
    }

    const { showDetails } = require("./details-dialog.js");
    showDetails(app, { title: APP_NAME, summary: "Nothing to convert.", detail: describeNoImages(rejected), buttons: ["OK"] });
    return undefined;
}

/*
 * A headless caller gets one thing back from osascript: the returned value on
 * success, the error on failure. An incomplete run has to be both, so the
 * receipt goes out on its own before the failure is raised — newline
 * terminated, because a caller reads it a line at a time.
 *
 * The writer is a parameter so the line that is actually written can be read
 * back in a test; the default is the real one.
 */
function reportHeadless(result, write = writeReceipt) {
    const receipt = JSON.stringify(result);

    if (isCompleteSuccess(result)) {
        return receipt;
    }

    write(`${receipt}\n`);

    throw new Error(describeIncomplete(result));
}

function reportResult(app, result, options) {
    if (options.headless) {
        return result;
    }

    showCompletion(app, result);

    // Said out loud rather than fallen off the end of: nothing is the answer
    // here, and the host does something with an answer.
    return undefined;
}

module.exports = {
    describeNoImages,
    reportNoImages,
    reportHeadless,
    reportResult
};
