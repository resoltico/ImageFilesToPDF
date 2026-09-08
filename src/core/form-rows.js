"use strict";

const {
    PAPER_SIZE,
    ORIENTATION,
    OUTPUT_MODE,
    BACKGROUND,
    RESOLUTION,
    QUALITY,
    defaultLabelOf,
    defaultValueOf
} = require("./choices.js");

/*
 * What the form asks, described as data.
 *
 * Which rows exist, what they are called, what may be chosen and what the
 * answers start out as. Everything decidable without AppKit is decided here,
 * so the runtime layer only has to turn a description into widgets -- which
 * is the part that cannot be tested headlessly. What the form *says* around
 * these rows is form.js, and what an answer may be is answers.js.
 *
 * The same controls back the stepwise dialogs, so the two front ends cannot
 * offer different options or accept different values.
 */

const CHOICE_ROWS = [
    { key: "paperSize", control: PAPER_SIZE },
    { key: "orientation", control: ORIENTATION },
    { key: "mode", control: OUTPUT_MODE }
];

/*
 * The background is a row of its own because it is the one setting that is
 * neither a closed list nor a number: the four colours are presets, and any
 * opaque sRGB colour may be typed instead. It sits where it always sat, after
 * the output mode and before the two numbers.
 *
 * Everything in that control is a colour -- the list holds the presets as the
 * values they are, and the field holds the one in force. It used to hold a
 * menu's wording, "White (#FFFFFF)", which is what made a control you can
 * type into look like one you cannot: a name reads as a choice somebody
 * already made. It also made an edit of it a mistake. Someone replacing the
 * code inside those brackets has written a perfectly good colour and is told
 * their answer is not one.
 *
 * The names are not lost, they are moved: a list of four codes says nothing
 * about which is the purple, so the line above the form says it instead,
 * where it can be read without opening anything.
 */
const COLOUR_ROW = { key: "background", control: BACKGROUND };

const COLOUR_TOOLTIP = "Choose a preset or type six hex digits, " +
    "for example #C7DAE8.";

const NUMBER_ROWS = [
    { key: "dpi", control: RESOLUTION },
    { key: "quality", control: QUALITY }
];

function defaultAnswers() {
    const answers = {};

    for (const { key, control } of CHOICE_ROWS) {
        answers[key] = defaultLabelOf(control);
    }

    answers[COLOUR_ROW.key] = defaultValueOf(COLOUR_ROW.control);

    for (const { key, control } of NUMBER_ROWS) {
        answers[key] = control.defaultAnswer;
    }

    return answers;
}

function formRows(answers, invalid) {
    const choices = CHOICE_ROWS.map(({ key, control }) => ({
        key,
        kind: "choice",
        label: control.label,
        value: String(answers[key]),
        invalid: invalid.has(key),
        options: control.choices.map((choice) => ({ label: choice.label }))
    }));

    const colour = {
        key: COLOUR_ROW.key,
        kind: "colour",
        label: COLOUR_ROW.control.label,
        tooltip: COLOUR_TOOLTIP,
        value: String(answers[COLOUR_ROW.key]),
        invalid: invalid.has(COLOUR_ROW.key),
        // What each item reads as, which for this row is the colour itself.
        options: COLOUR_ROW.control.choices.map((choice) => ({
            label: choice.value
        }))
    };

    const numbers = NUMBER_ROWS.map(({ key, control }) => ({
        key,
        kind: "number",
        label: control.label,
        hint: control.hint,
        value: String(answers[key]),
        invalid: invalid.has(key),
        minimum: control.minimum,
        maximum: control.maximum
    }));

    return [...choices, colour, ...numbers];
}

module.exports = {
    CHOICE_ROWS,
    COLOUR_ROW,
    NUMBER_ROWS,
    defaultAnswers,
    formRows
};
