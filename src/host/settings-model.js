"use strict";
const { SETTINGS_SCHEMA, validateSettings, settingIssue } = require("../core/settings.js");
const { normalizeColour } = require("../core/colour.js");
const { APP_NAME } = require("../core/version.js");
const { formSummary } = require("./output-description.js");

function controlFor(field) {
    const rule = SETTINGS_SCHEMA[field];
    return { field, label: `${rule.name}:`, prompt: rule.minimum ? `${rule.name} (${rule.minimum}–${rule.maximum}):` : `${rule.name}:`, defaultValue: rule.default,
        defaultAnswer: String(rule.default), minimum: rule.minimum, maximum: rule.maximum, hint: rule.hint,
        choices: (rule.choices ?? []).map((choice) => ({ value: choice.value, label: choice.label ?? `${choice.name} (${choice.value})` })) };
}
const PAPER_SIZE = controlFor("paperSize");
const ORIENTATION = controlFor("orientation");
const OUTPUT_MODE = controlFor("mode");
const BACKGROUND = controlFor("background");
const RESOLUTION = controlFor("resolutionLimit");
const QUALITY = controlFor("quality");

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

// State the custom hex input format beside the editable preset control.
const COLOUR_HINT = SETTINGS_SCHEMA.background.hint;

const NUMBER_ROWS = [
    { key: "resolutionLimit", control: RESOLUTION },
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
        // Named preset captions retain their canonical RGB values.
        options: COLOUR_ROW.control.choices.map((choice) => ({
            label: choice.label, value: choice.value
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

function readColour(answer) { const issue = settingIssue("background", answer); if (issue) { throw new Error(issue.message); } return normalizeColour(answer); }

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





const CREATE_BUTTON = "Create";
const CANCEL_BUTTON = "Cancel";

function invitation(context = {}, mode = "combined") {
    const folders = mode === "combined" ? (context.folders ?? []).slice(0, 1) : context.folders ?? [];
    return [formSummary(context, mode), folders.length > 0 ? `Save locations:\n${folders.join("\n")}` : ""].filter(Boolean).join("\n\n");
}

function formSpec(answers = defaultAnswers(), problems = [], context = {}) {
    return {
        title: APP_NAME,
        detail: problems.length > 0 ? problems.map((problem) => problem.message).join("\n") : "Choose the page settings, then Create.",
        fullDetail: invitation(context, answers.mode),
        summaryDetails: { combined: invitation(context, "combined"), separate: invitation(context, "separate") },
        rows: formRows(answers, new Set(problems.map((problem) => problem.key))),
        buttons: [CREATE_BUTTON, CANCEL_BUTTON]
    };
}

module.exports = { PAPER_SIZE, ORIENTATION, OUTPUT_MODE, BACKGROUND, RESOLUTION, QUALITY, labelsOf, defaultLabelOf, defaultValueOf, valueOfLabel, labelOfValue, CHOICE_ROWS, COLOUR_ROW, NUMBER_ROWS, defaultAnswers, formRows, readAnswers, answersFromSettings, readNumber, readColour, invitation, CREATE_BUTTON, CANCEL_BUTTON, formSpec };
