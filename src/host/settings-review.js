"use strict";

const { summarizeRun } = require("../core/run-summary.js");
const { APP_NAME } = require("../core/version.js");
const { plural } = require("./formatting.js");
const { UserCanceled } = require("../core/errors.js");
const { CREATE_BUTTON, CANCEL_BUTTON } = require("./settings-model.js");
const { PAPER_SIZE, labelOfValue } = require("./settings-model.js");
const {
    outputSummary,
    destinationSummary,
    PAGE_LAYOUT_NOTE
} = require("./output-description.js");
const { basename, dirname } = require("../core/paths.js");

/*
 * The two questions an interactive run asks besides its settings.
 *
 * Both are consent, so both answer only with the button that goes on: the
 * Cancel button is the dialog's cancel button, and anything else that comes
 * back is taken as a cancellation rather than as agreement. A headless run
 * never reaches either -- its configuration is the whole of what it is told.
 */

const REVIEW_SUMMARY = "Review the settings before creating PDFs.";

// A summary that carries a fact leads the text where there is no native alert
// to show it; the settings review's summary only names the step, so it does not.
function confirmAction(app, message, button, summary = REVIEW_SUMMARY) {
    const { showDetails } = require("./details-dialog.js");
    const fallbackDetail = summary === REVIEW_SUMMARY ? message : `${summary}\n\n${message}`;
    const answer = showDetails(app, { title: APP_NAME,
        summary, detail: message, fallbackDetail,
        buttons: [button, CANCEL_BUTTON] });
    if (answer !== 0) { throw new UserCanceled(); }
}

/*
 * Items that will not be converted are shown before the settings rather than
 * only after the run, so leaving out a locked folder is something agreed to
 * instead of something discovered afterwards.
 */
// The name leads so the reason reads beside it; a deep path follows on its own line.
function refusalLines(entry) {
    if (!entry.path) { return `${entry.name}: ${entry.reason}`; }
    const path = entry.path.replace(/(?<=.)\/+$/u, "");
    return `${basename(path)}: ${entry.reason}\nin ${dirname(path)}`;
}

function reviewSelection(app, context) {
    const { refusals: rejected } = summarizeRun({ state: "incomplete", documents: [], rejected: context.rejected ?? [], issues: [] });

    if (rejected.length > 0) {
        confirmAction(app, [
            `Not included:\n${rejected.map(refusalLines).join("\n\n")}`,
            `Continue with ${plural(context.count, "image")}?`
        ].join("\n\n"), "Continue", `${plural(rejected.length, "item")} in your selection cannot be included.`);
    }
}

/*
 * The form ends with its Create button; the stepwise dialogs end with the
 * last answer, which is not consent to write anything. So they finish on the
 * same question the form asks, stated with the answers actually given.
 */
function confirmSettings(app, settings, context) {
    const output = context.count > 0
        ? `Create ${outputSummary(settings.mode, context.count)}?`
        : "Create the PDF files?";

    confirmAction(app, [
        output,
        PAGE_LAYOUT_NOTE,
        `${labelOfValue(PAPER_SIZE, settings.paperSize)}, ${settings.orientation}; ` +
            `${settings.resolutionLimit} ppi; JPEG quality ${settings.quality}.`,
        `Page background: ${settings.background}.`,
        destinationSummary(context, settings.mode)
    ].filter(Boolean).join("\n"), CREATE_BUTTON);

    return settings;
}

module.exports = { refusalLines, reviewSelection, confirmSettings };
