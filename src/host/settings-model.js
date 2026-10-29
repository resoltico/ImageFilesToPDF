"use strict";

const { DEFAULT_SETTINGS, SETTING_CHOICES } = require("../core/settings.js");
const {
    MINIMUM_DPI,
    MAXIMUM_DPI,
    MINIMUM_QUALITY,
    MAXIMUM_QUALITY
} = require("../core/limits.js");

function offeredChoices(field, captions = {}) {
    return SETTING_CHOICES[field].map((value) => ({ label: captions[value] ?? value, value }));
}

const PAPER_SIZE = {
    defaultValue: DEFAULT_SETTINGS.paperSize,
    prompt: "Paper size:",
    label: "Paper size:",
    choices: offeredChoices("paperSize", { Letter: "US Letter" })
};

const ORIENTATION = {
    defaultValue: DEFAULT_SETTINGS.orientation,
    prompt: "Orientation:",
    label: "Orientation:",
    choices: offeredChoices("orientation")
};

const OUTPUT_MODE = {
    defaultValue: DEFAULT_SETTINGS.mode,
    prompt: "How should the PDF files be grouped?",
    label: "PDF files:",
    choices: offeredChoices("mode", { single: "One PDF — one image per page", separate: "Separate PDFs — one page per image" })
};

const BACKGROUND_PRESETS = [
    { name: "White", value: "#FFFFFF" }, { name: "Black", value: "#000000" },
    { name: "Purple", value: "#8E79E0" }, { name: "Dark blue", value: "#204486" }
];

const BACKGROUND = {
    defaultValue: DEFAULT_SETTINGS.background,
    prompt: "Page background:", label: "Page background:",
    choices: BACKGROUND_PRESETS.map(({ name, value }) => ({ label: `${name} (${value})`, value }))
};

const RESOLUTION = {
    field: "dpi",
    prompt: `Resolution in DPI (${MINIMUM_DPI}–${MAXIMUM_DPI}):`,
    label: "Resolution:",
    hint: `${MINIMUM_DPI}–${MAXIMUM_DPI} DPI`,
    defaultAnswer: String(DEFAULT_SETTINGS.dpi),
    minimum: MINIMUM_DPI,
    maximum: MAXIMUM_DPI
};

const QUALITY = {
    field: "quality",
    prompt:
        `JPEG quality (${MINIMUM_QUALITY}–${MAXIMUM_QUALITY}, ` +
        "90–95 is typical):",
    label: "JPEG quality:",
    hint: `${MINIMUM_QUALITY}–${MAXIMUM_QUALITY}, 90–95 is typical`,
    defaultAnswer: String(DEFAULT_SETTINGS.quality),
    minimum: MINIMUM_QUALITY,
    maximum: MAXIMUM_QUALITY
};

function labelsOf(control) {
    return control.choices.map((choice) => choice.label);
}

function defaultValueOf(control) {
    return control.defaultValue;
}

function labelOfValue(control, value) {
    const chosen = control.choices.find((choice) => choice.value === value);

    if (!chosen) {
        throw new Error(`Unrecognised value: ${value}`);
    }

    return chosen.label;
}

function defaultLabelOf(control) {
    return labelOfValue(control, control.defaultValue);
}

function valueOfLabel(control, label) {
    const chosen = control.choices.find((choice) => choice.label === label);

    if (!chosen) {
        throw new Error(`Unrecognised choice: ${label}`);
    }

    return chosen.value;
}

const CHOICE_ROWS = [
    { key: "mode", control: OUTPUT_MODE },
    { key: "paperSize", control: PAPER_SIZE },
    { key: "orientation", control: ORIENTATION }
];

const COLOUR_ROW = { key: "background", control: BACKGROUND };

// Beside the control, where the numbers state their range. It says the shape
// and that there is somewhere to type it, which is what a list of four codes
// cannot say for itself.
const COLOUR_HINT = "or type #RRGGBB";

const NUMBER_ROWS = [
    { key: "dpi", control: RESOLUTION },
    { key: "quality", control: QUALITY }
];

function defaultAnswers() {
    const answers = {};

    for (const { key, control } of CHOICE_ROWS) {
        answers[key] = defaultValueOf(control);
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
        options: control.choices.map((choice) => ({ ...choice }))
    }));

    const colour = {
        key: COLOUR_ROW.key,
        kind: "colour",
        label: COLOUR_ROW.control.label,
        hint: COLOUR_HINT,
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

const { validateSettings, settingIssue } = require("../core/settings.js");
const { normalizeColour } = require("../core/colour.js");

function numberValue(answer) {
    const text = String(answer).trim();
    return /^\d+$/u.test(text) ? Number(text) : NaN;
}

function readNumber(answer, control) {
    const value = numberValue(answer);
    const issue = settingIssue(control.field, value);
    if (issue) { throw new Error(issue.message); }
    return value;
}

function readColour(answer) { return normalizeColour(answer); }

function readAnswers(answers) {
    const values = { ...answers };
    for (const { key } of NUMBER_ROWS) { values[key] = numberValue(answers[key]); }
    const result = validateSettings(values);
    return result.settings ? { settings: result.settings } : {
        problems: result.issues.map((issue) => ({ ...issue, key: issue.field }))
    };
}

function answersFromSettings(settings) {
    const answers = {};
    for (const { key } of CHOICE_ROWS) { answers[key] = settings[key]; }
    answers[COLOUR_ROW.key] = settings[COLOUR_ROW.key];
    for (const { key } of NUMBER_ROWS) { answers[key] = String(settings[key]); }
    return answers;
}

const { APP_NAME } = require("../core/version.js");

const {
    selectionSummary,
    outputAlternatives,
    destinationSummary,
    PAGE_LAYOUT_NOTE,
    ORDER_NOTE
} = require("./output-description.js");

const CREATE_BUTTON = "Create";
const CANCEL_BUTTON = "Cancel";

const BACKGROUND_NOTE = `Page background presets: ${
    BACKGROUND.choices.map((choice) => choice.label).join(", ")  }.`;

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
        detail: problems.length > 0 ? problems.map((problem) => problem.message).join("\n") : "Choose the page settings, then Create.",
        fullDetail: invitation(context),
        rows: formRows(answers, new Set(problems.map((problem) => problem.key))),
        buttons: [CREATE_BUTTON, CANCEL_BUTTON]
    };
}

module.exports = { PAPER_SIZE, ORIENTATION, OUTPUT_MODE, BACKGROUND, RESOLUTION, QUALITY, labelsOf, defaultLabelOf, defaultValueOf, valueOfLabel, labelOfValue, CHOICE_ROWS, COLOUR_ROW, NUMBER_ROWS, defaultAnswers, formRows, readAnswers, answersFromSettings, readNumber, readColour, invitation, BACKGROUND_NOTE, CREATE_BUTTON, CANCEL_BUTTON, formSpec };
