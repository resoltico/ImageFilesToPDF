"use strict";

const { summarizeRun } = require("../core/run-summary.js");
const { summaryText } = require("./completion.js");
const { runOutcome } = require("../core/outcomes.js");
const { APP_NAME } = require("../core/version.js");
const { supportedFormatList } = require("../core/paths.js");
const { describeRejections, showCompletion } = require("./completion.js");
const {
    writeReceipt,
    exitCli
} = require("./receipt.js");

/*
 * Nothing to convert, which is a different message depending on whether
 * anything was asked for. Selecting only a GIF is not the same as selecting
 * nothing, and saying "no images selected" to someone who selected one is how
 * a rejection becomes invisible.
 */
function noImagesHeadline(rejected) {
    return rejected.length > 0 ? "Nothing to convert." : "No images selected.";
}

function describeNoImages(rejected, includeHeadline = true) {
    const detail = rejected.length > 0 ? describeRejections(rejected)
        : "Select image files or folders in Finder, then run the action again.\n\n" +
            `Supported: ${supportedFormatList()}.`;
    return includeHeadline ? `${noImagesHeadline(rejected)}\n\n${detail}` : detail;
}

function reportNoImages(app, headless, rejected) {
    if (headless) {
        return runOutcome([], rejected, [{ code: "no-images", stage: "selection", message: describeNoImages(rejected) }]);
    }

    const { showDetails } = require("./details-dialog.js");
    showDetails(app, { title: APP_NAME, summary: noImagesHeadline(rejected), detail: describeNoImages(rejected, false), fallbackDetail: describeNoImages(rejected), buttons: ["OK"] });
    return undefined;
}

// CLI writes one newline-terminated receipt to stdout, prose to stderr, then
// exits explicitly. Injectable writers let tests inspect both transport channels.
const INVALID_EXIT = 2;
const SETUP_EXIT = 3;
function exitCode(result) {
    if (result.state === "invalid") { return INVALID_EXIT; }
    if (result.issues.some((issue) => issue.stage === "setup")) { return SETUP_EXIT; }
    return result.state === "complete" ? 0 : 1;
}

function reportHeadless(result, write = writeReceipt, exit = exitCli) {
    write(`${JSON.stringify(result)}\n`);
    write(`${summaryText(summarizeRun(result))}\n`, undefined, true);
    return exit(exitCode(result));
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
