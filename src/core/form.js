"use strict";

const { APP_NAME } = require("./version.js");
const { formRows, defaultAnswers } = require("./form-rows.js");

/*
 * What the form says around its questions.
 *
 * The title above it, the buttons under it, and the line between the two --
 * which is either an invitation or the list of what needs correcting, because
 * a form that has come back has something to say first.
 */

const CREATE_BUTTON = "Create PDF";
const CANCEL_BUTTON = "Cancel";

/*
 * What the background takes, said on the screen rather than in a tooltip. A
 * tooltip is a place to put something nobody reads: the one instruction that
 * made the difference between a control with four colours in it and a control
 * that takes any colour at all was hidden in one, and a person looking at the
 * form could not tell the second from the first.
 *
 * The presets are named here, in the order the list holds them, because that
 * is what the list stopped saying when its items became codes.
 */
const BACKGROUND_NOTE = "Page background takes any six hex digits: " +
    "#FFFFFF white, #000000 black, #8E79E0 purple, #204486 dark blue.";

function invitation(count) {
    const opening = count > 0
        ? `${count} ${count === 1 ? "image" : "images"}. Choose how the ` +
            "pages are built, then create the PDF."
        : "Choose how the pages are built, then create the PDF.";

    return `${opening}\n${BACKGROUND_NOTE}`;
}

function formSpec(answers = defaultAnswers(), problems = [], count = 0) {
    return {
        title: APP_NAME,
        detail: problems.length > 0
            ? problems.map((problem) => problem.message).join("\n")
            : invitation(count),
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
