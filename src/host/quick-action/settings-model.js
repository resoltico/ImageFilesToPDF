"use strict";
const { SETTINGS_SCHEMA, SETTINGS_FIELDS, PDF_MODE, validateSettings, settingIssue } = require("../../core/settings.js");
const { normalizeColor } = require("../../core/color.js");
const { APP_NAME } = require("../../core/version.js");
const { formSummary } = require("./output-description.js");

function controlFor(field) {
    const rule = SETTINGS_SCHEMA[field];
    return { field, label: `${rule.name}:`, prompt: rule.kind === "integer" ? `${rule.name} (${rule.minimum}–${rule.maximum}${rule.unit ? ` ${rule.unit}` : ""}):` : `${rule.name}:`, defaultValue: rule.default,
        defaultAnswer: String(rule.default), minimum: rule.minimum, maximum: rule.maximum, hint: rule.hint,
        choices: (rule.choices ?? []).map((choice) => ({ value: choice.value, label: choice.label ?? `${choice.name} (${choice.value})` })) };
}
const CONTROLS = Object.fromEntries(SETTINGS_FIELDS.map((field) => [field, controlFor(field)]));
const PAPER_SIZE = CONTROLS.paperSize;
const ORIENTATION = CONTROLS.orientation;
const OUTPUT_MODE = CONTROLS.mode;
const BACKGROUND = CONTROLS.background;
const RESOLUTION = CONTROLS.resolutionLimit;
const QUALITY = CONTROLS.quality;

function labelsOf(control) {
    return control.choices.map((choice) => choice.label);
}

function defaultValueOf(control) {
    return control.defaultValue;
}

function labelOfValue(control, value) {
    const chosen = control.choices.find((choice) => choice.value === value);

    if (!chosen) {
        throw new Error(`Unrecognized value: ${value}`);
    }

    return chosen.label;
}

function defaultLabelOf(control) {
    return labelOfValue(control, control.defaultValue);
}

function valueOfLabel(control, label) {
    const chosen = control.choices.find((choice) => choice.label === label);

    if (!chosen) {
        throw new Error(`Unrecognized choice: ${label}`);
    }

    return chosen.value;
}

function rowsFor(kind) {
    return SETTINGS_FIELDS.filter((field) => SETTINGS_SCHEMA[field].kind === kind)
        .map((key) => ({ key, control: CONTROLS[key] }));
}
const CHOICE_ROWS = rowsFor("choice");
const [COLOR_ROW] = rowsFor("color");
const COLOR_HINT = COLOR_ROW.control.hint;
const NUMBER_ROWS = rowsFor("integer");

function answersFromSettings(settings) {
    return Object.fromEntries(SETTINGS_FIELDS.map((field) => [field,
        SETTINGS_SCHEMA[field].kind === "integer" ? String(settings[field]) : settings[field]]));
}

function defaultAnswers() {
    return answersFromSettings(Object.fromEntries(SETTINGS_FIELDS.map((field) => [field, SETTINGS_SCHEMA[field].default])));
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

    const color = {
        key: COLOR_ROW.key,
        kind: "color",
        label: COLOR_ROW.control.label,
        hint: COLOR_HINT,
        value: String(answers[COLOR_ROW.key]),
        invalid: invalid.has(COLOR_ROW.key),
        // Named preset captions retain their canonical RGB values.
        options: COLOR_ROW.control.choices.map((choice) => ({
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

    return [...choices, color, ...numbers];
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

function readColor(answer) { const issue = settingIssue("background", answer); if (issue) { throw new Error(issue.message); } return normalizeColor(answer); }

function readAnswers(answers) {
    const values = { ...answers };
    for (const { key } of NUMBER_ROWS) { values[key] = numberValue(answers[key]); }
    const result = validateSettings(values);
    return result.settings ? { settings: result.settings } : {
        problems: result.issues.map((issue) => ({ ...issue, key: issue.field }))
    };
}


const CREATE_BUTTON = "Create";
const CANCEL_BUTTON = "Cancel";

function invitation(context = {}, mode = PDF_MODE.combined) {
    const folders = mode === PDF_MODE.combined ? (context.folders ?? []).slice(0, 1) : context.folders ?? [];
    return [formSummary(context, mode), folders.length > 0 ? `Save locations:\n${folders.join("\n")}` : ""].filter(Boolean).join("\n\n");
}

// The message line names what to do; the scrollable note lists each problem before the usual note.
function correctionLine(problems) {
    if (problems.length === 0) { return "Choose the page settings, then Create."; }
    return problems.length === 1 ? "Correct the highlighted setting, listed below."
        : `Correct the ${problems.length} highlighted settings, listed below.`;
}

function formSpec(answers = defaultAnswers(), problems = [], context = {}) {
    const note = (mode) => [problems.map((problem) => problem.message).join("\n"), invitation(context, mode)].filter(Boolean).join("\n\n");
    return {
        title: APP_NAME,
        detail: correctionLine(problems),
        fullDetail: note(answers.mode),
        summaryDetails: { combined: note(PDF_MODE.combined), separate: note(PDF_MODE.separate) },
        rows: formRows(answers, new Set(problems.map((problem) => problem.key))),
        buttons: [CREATE_BUTTON, CANCEL_BUTTON]
    };
}

module.exports = { CONTROLS, PAPER_SIZE, ORIENTATION, OUTPUT_MODE, BACKGROUND, RESOLUTION, QUALITY, labelsOf, defaultLabelOf, defaultValueOf, valueOfLabel, labelOfValue, CHOICE_ROWS, COLOR_ROW, NUMBER_ROWS, defaultAnswers, formRows, readAnswers, answersFromSettings, readNumber, readColor, invitation, CREATE_BUTTON, CANCEL_BUTTON, formSpec };
