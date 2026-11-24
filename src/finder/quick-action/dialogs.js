"use strict";

const { normalizeSettings, SETTINGS_SCHEMA, SETTINGS_FIELDS } = require("../../core/settings.js");
const { UserCanceled } = require("../../core/errors.js");
const { readColor } = require("./settings-model.js");
const { chooseRequired, askUntil, promptInteger } = require("./prompts.js");

/*
 * The interactive front end when the form cannot be shown: the same six
 * questions, one at a time. What the run reports afterwards is completion.js.
 *
 * It opens on the answers it is given, which are the last run's when there
 * are any. Remembering must not stop working because AppKit did.
 */

const { APP_NAME } = require("../../core/version.js");
const { CONTROLS, BACKGROUND, labelsOf, valueOfLabel } = require("./settings-model.js");
const { defaultAnswers } = require("./settings-model.js");
const { selectionSummary, outputAlternatives } = require("./output-description.js");
const { confirmSettings } = require("./settings-review.js");

const CUSTOM_COLOR = "Custom color...";

/*
 * A color typed rather than chosen, with its own wording: "Page background:"
 * is the question a list answers, and not this one.
 */
const COLOR_QUESTION = { prompt: "Page background as six hexadecimal digits:" };

/*
 * The stepwise path has no control that is a list and a field at once, so the
 * two are two steps: the presets, and -- only when the last of them is chosen
 * -- the color itself.
 *
 * A remembered color that is one of the presets opens on that preset. One
 * that is not opens on "Custom color...", with the color itself already in
 * the prompt behind it, because a color worth remembering is worth offering
 * back rather than making somebody type again.
 */
function openingChoice(opening) {
    const preset = BACKGROUND.choices.find((choice) => choice.value === opening);

    return preset ? preset.label : CUSTOM_COLOR;
}

function promptColor(app, opening) {
    return askUntil(app, { ...COLOR_QUESTION, defaultAnswer: opening }, readColor);
}

function chooseColor(app, opening) {
    const choice = app.chooseFromList(
        [...labelsOf(BACKGROUND), CUSTOM_COLOR],
        {
            withTitle: APP_NAME,
            withPrompt: BACKGROUND.prompt,
            defaultItems: [openingChoice(opening)]
        }
    );

    if (!choice) {
        throw new UserCanceled();
    }

    return String(choice[0]) === CUSTOM_COLOR
        ? promptColor(app, opening)
        : valueOfLabel(BACKGROUND, choice[0]);
}

function dialogSetting(app, field, answers, context) {
    const control = CONTROLS[field];
    const { kind } = SETTINGS_SCHEMA[field];
    if (kind === "color") { return chooseColor(app, answers[field]); }
    if (kind === "integer") { return promptInteger(app, control, answers[field]); }
    const prompt = field === "mode"
        ? { ...control, prompt: [selectionSummary(context), outputAlternatives(context.count), control.prompt].join("\n") } : control;
    return chooseRequired(app, prompt, answers[field]);
}

function collectDialogSettings(app, answers = defaultAnswers(), context = {}) {
    const settings = Object.fromEntries(SETTINGS_FIELDS.map((field) => [field, dialogSetting(app, field, answers, context)]));
    return confirmSettings(app, normalizeSettings(settings), context);
}

module.exports = { chooseColor, collectDialogSettings };
