"use strict";

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
        throw new Error("User cancelled.");
    }

    return valueOfLabel(control, choice[0]);
}

function promptInteger(app, control) {
    const { prompt, defaultAnswer, minimum, maximum } = control;

    for (;;) {
        const response = app.displayDialog(prompt, {
            withTitle: APP_NAME,
            defaultAnswer,
            buttons: ["Cancel", "OK"],
            defaultButton: "OK",
            cancelButton: "Cancel"
        });
        const text = String(response.textReturned).trim();

        if (/^\d+$/u.test(text)) {
            const value = parseInt(text, 10);

            if (value >= minimum && value <= maximum) {
                return value;
            }
        }

        app.displayDialog(
            `Please enter a whole number from ${minimum} to ${maximum}.`,
            { withTitle: APP_NAME, buttons: ["OK"], defaultButton: "OK" }
        );
    }
}

function collectDialogSettings(app) {
    return {
        paperSize: chooseRequired(app, PAPER_SIZE),
        orientation: chooseRequired(app, ORIENTATION),
        dpi: promptInteger(app, RESOLUTION),
        quality: promptInteger(app, QUALITY),
        mode: chooseRequired(app, OUTPUT_MODE),
        background: chooseRequired(app, BACKGROUND)
    };
}

module.exports = {
    chooseRequired,
    promptInteger,
    collectDialogSettings
};
