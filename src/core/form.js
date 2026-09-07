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

const HEX_COLOUR = /^#(?<red>[\dA-F]{2})(?<green>[\dA-F]{2})(?<blue>[\dA-F]{2})$/u;
const HEX_RADIX = 16;

const CREATE_BUTTON = "Create PDF";
const CANCEL_BUTTON = "Cancel";

const CHOICE_ROWS = [
    { key: "paperSize", control: PAPER_SIZE },
    { key: "orientation", control: ORIENTATION },
    { key: "mode", control: OUTPUT_MODE },
    { key: "background", control: BACKGROUND }
];

const NUMBER_ROWS = [
    { key: "dpi", control: RESOLUTION },
    { key: "quality", control: QUALITY }
];

/*
 * Parsed here rather than in the widget layer, so that turning "#204486" into
 * a colour is covered by tests like everything else. A value that is not a
 * hex colour simply has no swatch, which is how the non-colour controls get
 * the same row shape.
 */
function swatchOf(value) {
    const match = HEX_COLOUR.exec(String(value));

    if (!match) {
        return null;
    }

    const { red, green, blue } = match.groups;

    return {
        red: parseInt(red, HEX_RADIX),
        green: parseInt(green, HEX_RADIX),
        blue: parseInt(blue, HEX_RADIX)
    };
}

function defaultAnswers() {
    const answers = {};

    for (const { key, control } of CHOICE_ROWS) {
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
        options: control.choices.map((choice) => ({
            label: choice.label,
            swatch: swatchOf(choice.value)
        }))
    }));

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

    return [...choices, ...numbers];
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
    NUMBER_ROWS,
    swatchOf,
    defaultAnswers,
    formSpec
};
