"use strict";

const { UserCancelled, errorMessage } = require("../core/errors.js");
const { readNumber, readColour } = require("../core/answers.js");

/*
 * The interactive front end: collecting the settings. What the run reports
 * afterwards is completion.js.
 */

const { APP_NAME } = require("../core/version.js");
const {
    PAPER_SIZE,
    ORIENTATION,
    OUTPUT_MODE,
    BACKGROUND,
    RESOLUTION,
    QUALITY,
    labelsOf,
    defaultLabelOf,
    valueOfLabel
} = require("../core/choices.js");

/*
 * Presents the labels and returns the value behind the one chosen, so the
 * wording a person sees is never the thing the pipeline stores.
 */
function chooseRequired(app, control) {
    const choice = app.chooseFromList(labelsOf(control), {
        withTitle: APP_NAME,
        withPrompt: control.prompt,
        defaultItems: [defaultLabelOf(control)]
    });

    if (!choice) {
        throw new UserCancelled();
    }

    return valueOfLabel(control, choice[0]);
}

const CUSTOM_COLOUR = "Custom colour...";

/*
 * A colour typed rather than chosen, with its own wording: "Page background:"
 * is the question a list answers, and not this one.
 */
const COLOUR_QUESTION = {
    prompt: "Page background as six hexadecimal digits:",
    defaultAnswer: "#"
};

/*
 * A question that will not take an answer it cannot use.
 *
 * What was typed comes back in the box. Asking again with the original
 * default in its place threw away the one thing the person had that the
 * program did not -- the value they were correcting -- and for a number it
 * put back a figure that looked as though it had been accepted.
 *
 * The reason goes into the prompt rather than into a dialog of its own, which
 * is what the form does with its problems: an answer and what is wrong with
 * it belong on one screen rather than on two in turn.
 *
 * displayDialog raises when the person cancels, and that call sits outside
 * the try deliberately: cancelling is a decision, not an unusable answer.
 */
function askUntil(app, control, read) {
    let answer = control.defaultAnswer;
    let problem = "";

    for (;;) {
        const response = app.displayDialog(
            problem ? `${problem}\n\n${control.prompt}` : control.prompt,
            {
                withTitle: APP_NAME,
                defaultAnswer: answer,
                buttons: ["Cancel", "OK"],
                defaultButton: "OK",
                cancelButton: "Cancel"
            }
        );

        answer = String(response.textReturned);

        try {
            return read(answer, control);
        } catch (error) {
            problem = errorMessage(error);
        }
    }
}

/*
 * The stepwise path has no control that is a list and a field at once, so the
 * two are two steps: the presets, and -- only when the last of them is chosen
 * -- the colour itself.
 */
function promptColour(app) {
    return askUntil(app, COLOUR_QUESTION, readColour);
}

function chooseColour(app) {
    const choice = app.chooseFromList(
        [...labelsOf(BACKGROUND), CUSTOM_COLOUR],
        {
            withTitle: APP_NAME,
            withPrompt: BACKGROUND.prompt,
            defaultItems: [defaultLabelOf(BACKGROUND)]
        }
    );

    if (!choice) {
        throw new UserCancelled();
    }

    return String(choice[0]) === CUSTOM_COLOUR
        ? promptColour(app)
        : valueOfLabel(BACKGROUND, choice[0]);
}

function promptInteger(app, control) {
    return askUntil(app, control, readNumber);
}

function collectDialogSettings(app) {
    return {
        paperSize: chooseRequired(app, PAPER_SIZE),
        orientation: chooseRequired(app, ORIENTATION),
        dpi: promptInteger(app, RESOLUTION),
        quality: promptInteger(app, QUALITY),
        mode: chooseRequired(app, OUTPUT_MODE),
        background: chooseColour(app)
    };
}

module.exports = {
    chooseRequired,
    chooseColour,
    promptInteger,
    collectDialogSettings
};
