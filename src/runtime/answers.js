"use strict";
const { validateSettings, settingIssue } = require("../core/settings.js");
const { normalizeColour } = require("../core/colour.js");
const { CHOICE_ROWS, NUMBER_ROWS, COLOUR_ROW } = require("./form-rows.js");

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

module.exports = { readAnswers, answersFromSettings, readNumber, readColour };
