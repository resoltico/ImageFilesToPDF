"use strict";

const {
    MINIMUM_DPI,
    MAXIMUM_DPI,
    MINIMUM_QUALITY,
    MAXIMUM_QUALITY
} = require("./settings.js");

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

const PAPER_SIZE = {
    prompt: "Paper size:",
    label: "Paper size:",
    choices: [
        { label: "A4", value: "A4" },
        { label: "US Letter", value: "Letter" }
    ]
};

const ORIENTATION = {
    prompt: "Orientation:",
    label: "Orientation:",
    choices: [
        { label: "Portrait", value: "Portrait" },
        { label: "Landscape", value: "Landscape" }
    ]
};

const OUTPUT_MODE = {
    prompt: "Output:",
    label: "Output:",
    choices: [
        { label: "One PDF with all images", value: "Single PDF" },
        { label: "A separate PDF for each image", value: "Separate PDFs" }
    ]
};

const BACKGROUND = {
    prompt: "Page background:",
    label: "Page background:",
    choices: [
        { label: "White (#FFFFFF)", value: "#FFFFFF" },
        { label: "Black (#000000)", value: "#000000" },
        { label: "Purple (#8E79E0)", value: "#8E79E0" },
        { label: "Dark blue (#204486)", value: "#204486" }
    ]
};

const RESOLUTION = {
    prompt: `Resolution in DPI (${MINIMUM_DPI}–${MAXIMUM_DPI}):`,
    label: "Resolution:",
    hint: `${MINIMUM_DPI}–${MAXIMUM_DPI} DPI`,
    defaultAnswer: "300",
    minimum: MINIMUM_DPI,
    maximum: MAXIMUM_DPI
};

const QUALITY = {
    prompt:
        `JPEG quality (${MINIMUM_QUALITY}–${MAXIMUM_QUALITY}, ` +
        "90–95 is typical):",
    label: "JPEG quality:",
    hint: `${MINIMUM_QUALITY}–${MAXIMUM_QUALITY}, 90–95 is typical`,
    defaultAnswer: "92",
    minimum: MINIMUM_QUALITY,
    maximum: MAXIMUM_QUALITY
};

function labelsOf(control) {
    return control.choices.map((choice) => choice.label);
}

function defaultLabelOf(control) {
    return control.choices[0].label;
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
    valueOfLabel
};
