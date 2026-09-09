"use strict";

const { UserCancelled } = require("../core/errors.js");
const { readColour } = require("../core/answers.js");
const { chooseRequired, askUntil, promptInteger } = require("./prompts.js");

/*
 * The interactive front end when the form cannot be shown: the same six
 * questions, one at a time. What the run reports afterwards is completion.js.
 *
 * It opens on the answers it is given, which are the last run's when there
 * are any. Remembering must not stop working because AppKit did.
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
    valueOfLabel
} = require("../core/choices.js");
const { defaultAnswers } = require("../core/form-rows.js");

const CUSTOM_COLOUR = "Custom colour...";

/*
 * A colour typed rather than chosen, with its own wording: "Page background:"
 * is the question a list answers, and not this one.
 */
const COLOUR_QUESTION = { prompt: "Page background as six hexadecimal digits:" };

/*
 * The stepwise path has no control that is a list and a field at once, so the
 * two are two steps: the presets, and -- only when the last of them is chosen
 * -- the colour itself.
 *
 * A remembered colour that is one of the presets opens on that preset. One
 * that is not opens on "Custom colour...", with the colour itself already in
 * the prompt behind it, because a colour worth remembering is worth offering
 * back rather than making somebody type again.
 */
function openingChoice(opening) {
    const preset = BACKGROUND.choices.find((choice) => choice.value === opening);

    return preset ? preset.label : CUSTOM_COLOUR;
}

function promptColour(app, opening) {
    return askUntil(app, { ...COLOUR_QUESTION, defaultAnswer: opening }, readColour);
}

function chooseColour(app, opening) {
    const choice = app.chooseFromList(
        [...labelsOf(BACKGROUND), CUSTOM_COLOUR],
        {
            withTitle: APP_NAME,
            withPrompt: BACKGROUND.prompt,
            defaultItems: [openingChoice(opening)]
        }
    );

    if (!choice) {
        throw new UserCancelled();
    }

    return String(choice[0]) === CUSTOM_COLOUR
        ? promptColour(app, opening)
        : valueOfLabel(BACKGROUND, choice[0]);
}

function collectDialogSettings(app, answers = defaultAnswers()) {
    return {
        paperSize: chooseRequired(app, PAPER_SIZE, answers.paperSize),
        orientation: chooseRequired(app, ORIENTATION, answers.orientation),
        dpi: promptInteger(app, RESOLUTION, answers.dpi),
        quality: promptInteger(app, QUALITY, answers.quality),
        mode: chooseRequired(app, OUTPUT_MODE, answers.mode),
        background: chooseColour(app, answers.background)
    };
}

module.exports = { chooseColour, collectDialogSettings };
