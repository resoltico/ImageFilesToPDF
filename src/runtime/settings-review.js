"use strict";

const { APP_NAME } = require("../core/version.js");
const { plural } = require("../core/numbers.js");
const { UserCancelled } = require("../core/errors.js");
const { CREATE_BUTTON, CANCEL_BUTTON } = require("../core/form.js");
const { PAPER_SIZE, labelOfValue } = require("../core/choices.js");
const {
    outputSummary,
    destinationSummary,
    PAGE_LAYOUT_NOTE
} = require("../core/output-description.js");
const { describeRejections } = require("./completion.js");

/*
 * The two questions an interactive run asks besides its settings.
 *
 * Both are consent, so both answer only with the button that goes on: the
 * Cancel button is the dialog's cancel button, and anything else that comes
 * back is taken as a cancellation rather than as agreement. A headless run
 * never reaches either -- its configuration is the whole of what it is told.
 */

function confirmAction(app, message, button) {
    const answer = app.displayDialog(message, {
        withTitle: APP_NAME,
        buttons: [CANCEL_BUTTON, button],
        defaultButton: button,
        cancelButton: CANCEL_BUTTON
    });

    if (answer.buttonReturned !== button) {
        throw new UserCancelled();
    }
}

/*
 * Items that will not be converted are shown before the settings rather than
 * only after the run, so leaving out a locked folder is something agreed to
 * instead of something discovered afterwards.
 */
function reviewSelection(app, context) {
    const rejected = context.rejected ?? [];

    if (rejected.length > 0) {
        confirmAction(app, [
            describeRejections(rejected, `${plural(rejected.length, "item")} ` +
                "in your selection cannot be included:"),
            `Continue with ${plural(context.count, "image")}?`
        ].join("\n\n"), "Continue");
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
            `${settings.dpi} DPI; JPEG quality ${settings.quality}.`,
        `Page background: ${settings.background}.`,
        destinationSummary(context, settings.mode)
    ].filter(Boolean).join("\n"), CREATE_BUTTON);

    return settings;
}

module.exports = { reviewSelection, confirmSettings };
