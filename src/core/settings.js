"use strict";
const { normalizeColour, COLOUR_ERROR } = require("./colour.js");
const { PAGE_DEFINITIONS, MINIMUM_RESOLUTION_LIMIT, MAXIMUM_RESOLUTION_LIMIT, MINIMUM_QUALITY, MAXIMUM_QUALITY } = require("./limits.js");

const SETTINGS_SCHEMA = Object.freeze({
    paperSize: { name: "Paper size", default: "A4", choices: Object.keys(PAGE_DEFINITIONS).map((value) => ({ value, label: value === "Letter" ? "US Letter" : value })) },
    orientation: { name: "Orientation", default: "Portrait", choices: ["Portrait", "Landscape"].map((value) => ({ value, label: value })) },
    mode: { name: "PDF files", default: "combined", choices: [
        { value: "combined", label: "One PDF — one image per page" }, { value: "separate", label: "Separate PDFs — one page per image" }
    ] },
    resolutionLimit: { name: "Maximum resolution", default: 300, minimum: MINIMUM_RESOLUTION_LIMIT, maximum: MAXIMUM_RESOLUTION_LIMIT, hint: `${MINIMUM_RESOLUTION_LIMIT}–${MAXIMUM_RESOLUTION_LIMIT} ppi` },
    quality: { name: "JPEG quality", default: 92, minimum: MINIMUM_QUALITY, maximum: MAXIMUM_QUALITY, hint: `${MINIMUM_QUALITY}–${MAXIMUM_QUALITY}, JPEG re-encoding only` },
    background: { name: "Page background", default: "#FFFFFF", hint: "or type #RRGGBB", choices: [
        { name: "White", value: "#FFFFFF" }, { name: "Black", value: "#000000" },
        { name: "Purple", value: "#8E79E0" }, { name: "Dark blue", value: "#204486" }
    ] }
});
const SETTINGS_FIELDS = Object.keys(SETTINGS_SCHEMA);
const DEFAULT_SETTINGS = Object.freeze(Object.fromEntries(SETTINGS_FIELDS.map((field) => [field, SETTINGS_SCHEMA[field].default])));
const SETTING_CHOICES = Object.freeze(Object.fromEntries(["paperSize", "orientation", "mode"].map((field) => [field, SETTINGS_SCHEMA[field].choices.map((choice) => choice.value)])));

function settingIssue(field, value) {
    const rule = SETTINGS_SCHEMA[field];
    if (field === "background") {
        try { normalizeColour(value); return null; }
        catch { return { field, code: "colour", stage: "settings", message: `${rule.name} ${COLOUR_ERROR}` }; }
    }
    if (rule.choices) {
        return typeof value === "string" && rule.choices.some((choice) => choice.value === value) ? null
            : { field, code: "choice", stage: "settings", message: `${rule.name} must be one of: ${rule.choices.map((choice) => choice.value).join(", ")}.` };
    }
    return typeof value === "number" && Number.isInteger(value) && value >= rule.minimum && value <= rule.maximum ? null
        : { field, code: "integer", stage: "settings", message: `${rule.name} must be a whole number from ${rule.minimum} to ${rule.maximum}.` };
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
    return issues.length > 0 ? { issues } : { issues: [], settings: {
        paperSize: input.paperSize, orientation: input.orientation, mode: input.mode,
        background: normalizeColour(input.background), resolutionLimit: input.resolutionLimit, quality: input.quality
    } };
}

function normalizeSettings(input) {
    const result = validateSettings(input);
    if (result.issues.length > 0) {
        const error = new Error(result.issues.map((issue) => issue.message).join("\n"));
        error.issues = result.issues;
        throw error;
    }
    return result.settings;
}

function isSeparateMode(settings) { return settings.mode === "separate"; }
module.exports = { SETTINGS_SCHEMA, SETTING_CHOICES, DEFAULT_SETTINGS, SETTINGS_FIELDS, settingIssue, validateSettings, normalizeSettings, isSeparateMode };
