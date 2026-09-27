"use strict";

const { APP_NAME, VERSION } = require("../core/version.js");
const { outputSummary } = require("../core/output-description.js");
const { plural } = require("../core/numbers.js");
const { dirname } = require("../core/paths.js");

/*
 * What the run says it did once it is over.
 *
 * Every completion says the same things in the same order: what was produced,
 * where it went, what was not converted, and how long it took. Producing files
 * without saying where they are is the one thing this exists to prevent.
 */

const MAXIMUM_SHOWN_FAILURES = 12;

function describeFailures(failures) {
    const shown = failures
        .slice(0, MAXIMUM_SHOWN_FAILURES)
        .map((entry) => `${entry.name}: ${entry.message}`);

    if (failures.length > shown.length) {
        shown.push(`...and ${plural(failures.length - shown.length, "more failure")}.`);
    }

    return `Could not convert ${plural(failures.length, "image")}:\n${shown.join("\n")}`;
}

/*
 * The files that were asked for and will not be converted, each with its
 * reason. Truncated like the failure list, because a selection can be large.
 * The heading depends on when it is said: before the run or after it.
 */
function describeRejections(rejected, heading = "Not converted:") {
    const shown = rejected
        .slice(0, MAXIMUM_SHOWN_FAILURES)
        .map((entry) => `${entry.name}: ${entry.reason}`);

    if (rejected.length > shown.length) {
        shown.push(`...and ${rejected.length - shown.length} more.`);
    }

    return `${heading}\n${shown.join("\n")}`;
}

/*
 * Every folder that received a PDF, not merely the first.
 *
 * Separate output follows its source, so a selection spanning two folders
 * produces PDFs in two folders. Naming only the first says the rest are
 * somewhere they are not.
 */
function describeDestinations(outputs) {
    const folders = [...new Set(outputs.map((output) => dirname(output)))];

    return folders.length === 1
        ? folders[0]
        : `${folders.length} folders:\n${folders.join("\n")}`;
}

function versionLine() {
    return `${APP_NAME} ${VERSION}`;
}

/*
 * A run that was asked to stop says so, and how much it did not get to.
 *
 * Only a separate run reaches this: it publishes as it goes, so stopping
 * leaves real PDFs on disk, and saying nothing about them is the one thing
 * this dialog exists to prevent. A combined run that stops produced nothing
 * and ends in silence, like every other cancellation.
 *
 * Counted rather than listed: reading four hundred filenames back is not news.
 *
 * "Not converted" rather than "not started", because one of them may have
 * been: a stop takes effect at the next thing the run says it is about to do,
 * which for the image in hand is partway through it. What is true of all of
 * them is that no PDF came out.
 */
function stoppedLine(result, pageCount) {
    if (!result.stopped) {
        return "";
    }

    return `Stopped. ${
        plural(pageCount - result.outputs.length, "image")} not converted.`;
}

/*
 * Counted from what was published, not from what was selected: a stopped or
 * partly failed separate run saved fewer PDFs, a failed combined run none.
 */
function createdLine(mode, result, pageCount) {
    if (result.outputs.length === 0) {
        return "No PDF was created.";
    }

    return `Created ${outputSummary(
        mode, mode === "single" ? pageCount : result.outputs.length
    )}.`;
}

/*
 * Every completion says the same things in the same order, one paragraph
 * each: what was produced and where it went, which images failed to convert,
 * which selected items were never images to convert, and how long it took.
 * The last two are kept apart because a locked folder is not a failed image.
 */
function completionMessage(mode, result, pageCount) {
    const rejected = result.rejected ?? [];
    const destination = mode === "single"
        ? result.outputs[0]
        : describeDestinations(result.outputs);

    return [
        result.failures.length > 0 ? "Finished with errors." : "",
        [
            createdLine(mode, result, pageCount),
            stoppedLine(result, pageCount),
            result.outputs.length > 0 ? `Saved to: ${destination}` : ""
        ].filter(Boolean).join("\n"),
        result.failures.length > 0 ? describeFailures(result.failures) : "",
        rejected.length > 0
            ? describeRejections(rejected, "Not included from your selection:")
            : "",
        `Elapsed: ${result.elapsed}`,
        versionLine()
    ].filter(Boolean).join("\n\n");
}

function showCompletion(app, mode, result, pageCount) {
    app.displayDialog(completionMessage(mode, result, pageCount), {
        withTitle: APP_NAME,
        buttons: ["OK"],
        defaultButton: "OK"
    });
}

module.exports = {
    describeRejections,
    describeDestinations,
    completionMessage,
    showCompletion
};
