"use strict";

const { APP_NAME } = require("./version.js");
const {
    PAPER_SIZE,
    ORIENTATION,
    OUTPUT_MODE,
    BACKGROUND,
    RESOLUTION,
    QUALITY,
    defaultLabelOf
} = require("./choices.js");

/*
 * The settings form, described as data.
 *
 * Everything about the form that can be decided without AppKit is decided
 * here: which rows exist, what they are called, what may be chosen, what the
 * answers mean, and which answers are refused. The runtime layer then only
 * has to turn this description into widgets, which is the part that cannot be
 * tested headlessly.
 *
 * The same controls back the stepwise dialogs, so the two front ends cannot
 * offer different options or accept different values.
 */

const CREATE_BUTTON = "Create PDF";
const CANCEL_BUTTON = "Cancel";

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

    for (const { key, control } of [...CHOICE_ROWS, COLOUR_ROW]) {
        answers[key] = defaultLabelOf(control);
    }

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
        options: COLOUR_ROW.control.choices.map((choice) => ({
            label: choice.label
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

/*
 * Previous answers are carried back in, so a form redisplayed after a bad
 * entry does not discard the five fields that were fine. The problems are
 * both listed above the form and used to mark the rows they name: reading
 * which field is wrong and seeing it should not be different jobs.
 */
/*
 * Selecting a folder can mean a great many images, and the form is the only
 * place between the selection and the work where the run can be called off.
 * Saying how many were found makes Cancel a decision rather than a guess.
 */
function invitation(count) {
    return count > 0
        ? `${count} ${count === 1 ? "image" : "images"}. Choose how the ` +
            "pages are built, then create the PDF."
        : "Choose how the pages are built, then create the PDF.";
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
    CREATE_BUTTON,
    CANCEL_BUTTON,
    CHOICE_ROWS,
    COLOUR_ROW,
    NUMBER_ROWS,
    defaultAnswers,
    formSpec
};
