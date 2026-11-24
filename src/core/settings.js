"use strict";
const { IssueError } = require("./errors.js");
const { normalizeColor } = require("./color.js");
const { issueMessage, issueMessages, message } = require("./messages.js");
const { PAGE_DEFINITIONS, MINIMUM_RESOLUTION_LIMIT, MAXIMUM_RESOLUTION_LIMIT, MINIMUM_QUALITY, MAXIMUM_QUALITY } = require("./limits.js");

const PDF_MODE = Object.freeze({ combined: "combined", separate: "separate" });

const SETTINGS_SCHEMA = Object.freeze({
    mode: { kind: "choice", name: "PDF files", default: PDF_MODE.combined, choices: [
        { value: PDF_MODE.combined, label: "One PDF — one image per page" }, { value: PDF_MODE.separate, label: "Separate PDFs — one page per image" }
    ] },
    paperSize: { kind: "choice", name: "Paper size", default: "A4", choices: Object.entries(PAGE_DEFINITIONS).map(([value, definition]) => ({ value, label: definition.label })) },
    orientation: { kind: "choice", name: "Orientation", default: "Portrait", choices: ["Portrait", "Landscape"].map((value) => ({ value, label: value })) },
    resolutionLimit: { kind: "integer", name: "Maximum resolution", default: 300, minimum: MINIMUM_RESOLUTION_LIMIT, maximum: MAXIMUM_RESOLUTION_LIMIT, unit: "ppi", formHint: `${MINIMUM_RESOLUTION_LIMIT}–${MAXIMUM_RESOLUTION_LIMIT} ppi` },
    quality: { kind: "integer", name: "JPEG quality", default: 82, minimum: MINIMUM_QUALITY, maximum: MAXIMUM_QUALITY, description: "JPEG re-encoding only", formHint: `${MINIMUM_QUALITY}–${MAXIMUM_QUALITY}, JPEG re-encoding only` },
    background: { kind: "color", name: "Page background", default: "#FFFFFF", formHint: message("settingsColorFormHint"), description: message("settingsColorValue"), choices: [
        { name: "White", value: "#FFFFFF" }, { name: "Black", value: "#000000" },
        { name: "Purple", value: "#8E79E0" }, { name: "Dark blue", value: "#204486" }
    ] }
});
const SETTINGS_FIELDS = Object.keys(SETTINGS_SCHEMA);
const DEFAULT_SETTINGS = Object.freeze(Object.fromEntries(SETTINGS_FIELDS.map((field) => [field, SETTINGS_SCHEMA[field].default])));

function settingValueIssue(field, value, naming) {
    const rule = SETTINGS_SCHEMA[field];
    const subject = naming === "keys" ? `\`${field}\`` : rule.name;
    if (rule.kind === "color") {
        try { normalizeColor(value); return null; }
        catch { return { field, ...issueMessage("color", "settings", "settingsColor", { subject }) }; }
    }
    if (rule.kind === "choice") {
        return typeof value === "string" && rule.choices.some((choice) => choice.value === value) ? null
            : { field, ...issueMessage("choice", "settings", "settingsChoice", { subject, choices: rule.choices.map((choice) => choice.value).join(", ") }) };
    }
    return typeof value === "number" && Number.isInteger(value) && value >= rule.minimum && value <= rule.maximum ? null
        : { field, ...issueMessage("integer", "settings", "settingsInteger", { subject, minimum: rule.minimum, maximum: rule.maximum }) };
}

function settingType(value) {
    if (value === null) { return "null"; }
    return Array.isArray(value) ? "array" : typeof value;
}

function settingIssue(field, value, naming) {
    const issue = settingValueIssue(field, value, naming);
    if (!issue) { return null; }
    if (value === undefined) { return { ...issue, ...(naming === "keys" ? issueMessage(issue.code, "settings", "settingsMissing", { subject: `\`${field}\`` }) : {}), diagnostic: { missing: true } }; }
    const expectedType = SETTINGS_SCHEMA[field].kind === "integer" ? "number" : "string";
    const actualType = settingType(value);
    if (actualType === expectedType) { return issue; }
    const description = actualType === "null" ? "null" : `${["array", "object"].includes(actualType) ? "an" : "a"} ${actualType}`;
    return { ...issue, ...(naming === "keys" ? issueMessage(issue.code, "settings", "settingsType", { subject: `\`${field}\``, expectedType, description }) : {}), diagnostic: { expectedType, actualType } };
}

function validateSettings(input, naming) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        return { issues: [issueMessage("object", "settings", "settingsObject")] };
    }
    const issues = Object.keys(input).filter((key) => !SETTINGS_FIELDS.includes(key))
        .map((field) => ({ field, ...issueMessage("unknown", "settings", naming === "keys" ? "settingsUnknownKey" : "settingsUnknownField", naming === "keys" ? { key: JSON.stringify(field) } : { field }) }));
    for (const field of SETTINGS_FIELDS) {
        const issue = settingIssue(field, input[field], naming);
        if (issue) { issues.push(issue); }
    }
    return issues.length > 0 ? { issues } : { issues: [], settings: Object.fromEntries(SETTINGS_FIELDS.map((field) =>
        [field, SETTINGS_SCHEMA[field].kind === "color" ? normalizeColor(input[field]) : input[field]])) };
}

function normalizeSettings(input) {
    const result = validateSettings(input);
    if (result.issues.length > 0) {
        const error = new IssueError(issueMessages(result.issues), { issues: result.issues });
        throw error;
    }
    return result.settings;
}

function isSeparateMode(settings) { return settings.mode === PDF_MODE.separate; }
module.exports = { PDF_MODE, SETTINGS_SCHEMA, DEFAULT_SETTINGS, SETTINGS_FIELDS, settingIssue, validateSettings, normalizeSettings, isSeparateMode };
