"use strict";

const { DEFAULT_SETTINGS, SETTING_CHOICES } = require("../core/settings.js");
const {
    MINIMUM_DPI,
    MAXIMUM_DPI,
    MINIMUM_QUALITY,
    MAXIMUM_QUALITY
} = require("../core/limits.js");

/*
 * What the settings dialogs say, and what each answer means.
 *
 * The label a person reads is kept separate from the value the pipeline uses,
 * so wording can be improved without changing the stored settings. "Letter" is
 * shown as "US Letter" because that is what macOS itself calls it, and because
 * "Letter" alone is an English word rather than an obviously named paper size.
 *
 * Ranges are interpolated from the bounds that validate them, so a prompt
 * cannot promise a range the validator does not accept.
 *
 * Each control carries two names. `prompt` is the whole question a stepwise
 * dialog asks, where it is the only text on screen. `label` sits beside a
 * control in the form, where a question would be too long: measured, the
 * quality prompt renders 230 points wide against a 175 point label column,
 * and was clipped mid-range to "JPEG quality (1-100, 90-95" — an unclosed
 * parenthesis that read as a typo. The bounds moved to `hint`, which is
 * shown beside the field rather than inside its name.
 */

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

/*
 * The other way round, for a value coming back into the form: which of the
 * offered answers is this one? Every choice control's value is what
 * normalizeSettings produces, so a remembered setting finds its own label
 * without anything in between.
 */
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

module.exports = {
    PAPER_SIZE,
    ORIENTATION,
    OUTPUT_MODE,
    BACKGROUND,
    RESOLUTION,
    QUALITY,
    labelsOf,
    defaultLabelOf,
    defaultValueOf,
    valueOfLabel,
    labelOfValue
};
