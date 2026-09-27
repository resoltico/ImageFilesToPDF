"use strict";

const { APP_NAME } = require("./version.js");
const { formRows, defaultAnswers } = require("./form-rows.js");
const {
    selectionSummary,
    outputAlternatives,
    destinationSummary,
    PAGE_LAYOUT_NOTE,
    ORDER_NOTE
} = require("./output-description.js");

/*
 * What the form says around its questions.
 *
 * The title above it, the buttons under it, and the text between the two:
 * what was selected, what will be created, and where it will go. A form that
 * has come back puts what needs correcting first and keeps the rest, because
 * a correction is made against the same selection.
 *
 * "Create" rather than "Create PDF", since the same button makes one PDF or
 * hundreds.
 */

const CREATE_BUTTON = "Create";
const CANCEL_BUTTON = "Cancel";

/*
 * What the four codes mean, in the order the list holds them, because that is
 * what the list stopped saying when its items became colours. That the row
 * can be typed into is said beside the row itself; this only has to name
 * them, so it does.
 */
const BACKGROUND_NOTE = "Page background presets: #FFFFFF white, " +
    "#000000 black, #8E79E0 purple, #204486 dark blue.";

function invitation(context = {}) {
    return [
        selectionSummary(context),
        PAGE_LAYOUT_NOTE,
        outputAlternatives(context.count),
        ORDER_NOTE,
        destinationSummary(context),
        BACKGROUND_NOTE
    ].filter(Boolean).join("\n");
}

function formSpec(answers = defaultAnswers(), problems = [], context = {}) {
    return {
        title: APP_NAME,
        detail: [
            ...problems.map((problem) => problem.message),
            invitation(context)
        ].join("\n"),
        rows: formRows(answers, new Set(problems.map((problem) => problem.key))),
        buttons: [CREATE_BUTTON, CANCEL_BUTTON]
    };
}

module.exports = {
    invitation,
    BACKGROUND_NOTE,
    CREATE_BUTTON,
    CANCEL_BUTTON,
    defaultAnswers,
    formSpec
};
