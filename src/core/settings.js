"use strict";
const { IssueError } = require("./errors.js");
const { normalizeColor, COLOR_ERROR } = require("./color.js");
const { PAGE_DEFINITIONS, MINIMUM_RESOLUTION_LIMIT, MAXIMUM_RESOLUTION_LIMIT, MINIMUM_QUALITY, MAXIMUM_QUALITY } = require("./limits.js");

const PDF_MODE = Object.freeze({ combined: "combined", separate: "separate" });

const SETTINGS_SCHEMA = Object.freeze({
    mode: { kind: "choice", name: "PDF files", default: PDF_MODE.combined, choices: [
        { value: PDF_MODE.combined, label: "One PDF — one image per page" }, { value: PDF_MODE.separate, label: "Separate PDFs — one page per image" }
    ] },
    paperSize: { kind: "choice", name: "Paper size", default: "A4", choices: Object.entries(PAGE_DEFINITIONS).map(([value, definition]) => ({ value, label: definition.label })) },
    orientation: { kind: "choice", name: "Orientation", default: "Portrait", choices: ["Portrait", "Landscape"].map((value) => ({ value, label: value })) },
    resolutionLimit: { kind: "integer", name: "Maximum resolution", default: 300, minimum: MINIMUM_RESOLUTION_LIMIT, maximum: MAXIMUM_RESOLUTION_LIMIT, unit: "ppi", hint: `${MINIMUM_RESOLUTION_LIMIT}–${MAXIMUM_RESOLUTION_LIMIT} ppi` },
    quality: { kind: "integer", name: "JPEG quality", default: 82, minimum: MINIMUM_QUALITY, maximum: MAXIMUM_QUALITY, note: "JPEG re-encoding only", hint: `${MINIMUM_QUALITY}–${MAXIMUM_QUALITY}, JPEG re-encoding only` },
    background: { kind: "color", name: "Page background", default: "#FFFFFF", hint: "or type #RRGGBB", choices: [
        { name: "White", value: "#FFFFFF" }, { name: "Black", value: "#000000" },
        { name: "Purple", value: "#8E79E0" }, { name: "Dark blue", value: "#204486" }
    ] }
});
const SETTINGS_FIELDS = Object.keys(SETTINGS_SCHEMA);
const DEFAULT_SETTINGS = Object.freeze(Object.fromEntries(SETTINGS_FIELDS.map((field) => [field, SETTINGS_SCHEMA[field].default])));
const SETTING_CHOICES = Object.freeze(Object.fromEntries(SETTINGS_FIELDS.filter((field) => SETTINGS_SCHEMA[field].kind === "choice").map((field) => [field, SETTINGS_SCHEMA[field].choices.map((choice) => choice.value)])));

function settingValueIssue(field, value) {
    const rule = SETTINGS_SCHEMA[field];
    if (rule.kind === "color") {
        try { normalizeColor(value); return null; }
        catch { return { field, code: "color", stage: "settings", message: `${rule.name} ${COLOR_ERROR}` }; }
    }
    if (rule.kind === "choice") {
        return typeof value === "string" && rule.choices.some((choice) => choice.value === value) ? null
            : { field, code: "choice", stage: "settings", message: `${rule.name} must be one of: ${rule.choices.map((choice) => choice.value).join(", ")}.` };
    }
    return typeof value === "number" && Number.isInteger(value) && value >= rule.minimum && value <= rule.maximum ? null
        : { field, code: "integer", stage: "settings", message: `${rule.name} must be a whole number from ${rule.minimum} to ${rule.maximum}.` };
}

function settingType(value) {
    if (value === null) { return "null"; }
    return Array.isArray(value) ? "array" : typeof value;
}

function settingIssue(field, value) {
    const issue = settingValueIssue(field, value);
    if (!issue) { return null; }
    if (value === undefined) { return { ...issue, diagnostic: { missing: true } }; }
    const expectedType = SETTINGS_SCHEMA[field].kind === "integer" ? "number" : "string";
    const actualType = settingType(value);
    return actualType === expectedType ? issue : { ...issue, diagnostic: { expectedType, actualType } };
}

function validateSettings(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        return { issues: [{ code: "object", stage: "settings", message: "Settings must be an object." }] };
    }
    const issues = Object.keys(input).filter((key) => !SETTINGS_FIELDS.includes(key))
        .map((field) => ({ field, code: "unknown", stage: "settings", message: `Unknown setting: ${field}.` }));
    for (const field of SETTINGS_FIELDS) {
        const issue = settingIssue(field, input[field]);
        if (issue) { issues.push(issue); }
    }
    return issues.length > 0 ? { issues } : { issues: [], settings: Object.fromEntries(SETTINGS_FIELDS.map((field) =>
        [field, SETTINGS_SCHEMA[field].kind === "color" ? normalizeColor(input[field]) : input[field]])) };
}

function normalizeSettings(input) {
    const result = validateSettings(input);
    if (result.issues.length > 0) {
        const error = new IssueError(result.issues.map((issue) => issue.message).join("\n"), { issues: result.issues });
        throw error;
    }
    return result.settings;
}

function isSeparateMode(settings) { return settings.mode === PDF_MODE.separate; }
module.exports = { PDF_MODE, SETTINGS_SCHEMA, SETTING_CHOICES, DEFAULT_SETTINGS, SETTINGS_FIELDS, settingIssue, validateSettings, normalizeSettings, isSeparateMode };
