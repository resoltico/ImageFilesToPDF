"use strict";

const { APP_NAME, VERSION } = require("../core/version.js");
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
    const shown = failures.slice(0, MAXIMUM_SHOWN_FAILURES);

    if (failures.length > shown.length) {
        shown.push(`...and ${failures.length - shown.length} more failure(s).`);
    }

    return shown.join("\n");
}

/*
 * The files that were asked for and will not be converted, each with its
 * reason. Truncated like the failure list, because a selection can be large.
 */
function describeRejections(rejected) {
    const shown = rejected
        .slice(0, MAXIMUM_SHOWN_FAILURES)
        .map((entry) => `${entry.name}: ${entry.reason}`);

    if (rejected.length > shown.length) {
        shown.push(`...and ${rejected.length - shown.length} more.`);
    }

    return `Not converted:\n${shown.join("\n")}`;
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
    return `\n${APP_NAME} ${VERSION}`;
}

/*
 * Every completion says the same three things in the same order: what was
 * produced, where it went, and how long it took. Producing files without
 * saying where they are is the one thing this dialog exists to prevent.
 */
function completionMessage(mode, result, pageCount) {
    const rejected = result.rejected ?? [];
    const notConverted = rejected.length > 0
        ? `\n${describeRejections(rejected)}`
        : "";

    if (result.failures.length > 0) {
        return [
            `Finished with errors.\n`,
            `Created: ${plural(result.outputs.length, "PDF")}`,
            `Failed: ${result.failures.length + rejected.length}`,
            `Elapsed: ${result.elapsed}\n`,
            // Where the PDFs that were created actually went.
            result.outputs.length > 0
                ? `In: ${describeDestinations(result.outputs)}\n`
                : "",
            describeFailures(result.failures),
            notConverted,
            versionLine()
        ].filter(Boolean).join("\n");
    }

    if (mode === "single") {
        return [
            `Created one PDF from ${plural(pageCount, "image")}.\n`,
            result.outputs[0],
            notConverted,
            `\nElapsed: ${result.elapsed}`,
            versionLine()
        ].filter(Boolean).join("\n");
    }

    return [
        `Created ${plural(result.outputs.length, "PDF")}.\n`,
        describeDestinations(result.outputs),
        notConverted,
        `\nElapsed: ${result.elapsed}`,
        versionLine()
    ].filter(Boolean).join("\n");
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
