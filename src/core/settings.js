"use strict";

const { normalizeColour } = require("./colour.js");
const { PAGE_DEFINITIONS, MINIMUM_DPI, MAXIMUM_DPI,
    MINIMUM_QUALITY, MAXIMUM_QUALITY } = require("./limits.js");

/** @typedef {{paperSize:"A4"|"Letter", orientation:"Portrait"|"Landscape", mode:"single"|"separate", dpi:number, quality:number, background:string}} ValidatedSettings
 * Only validateSettings/normalizeSettings produce this record; execution and geometry consume it unchanged.
 */
const DEFAULT_SETTINGS = Object.freeze({
    paperSize: "A4", orientation: "Portrait", mode: "single",
    dpi: 300, quality: 92, background: "#FFFFFF"
});
const SETTINGS_FIELDS = Object.keys(DEFAULT_SETTINGS);
const SETTING_CHOICES = Object.freeze({ paperSize: Object.keys(PAGE_DEFINITIONS),
    orientation: ["Portrait", "Landscape"], mode: ["single", "separate"] });
const RULES = {
    paperSize: { values: SETTING_CHOICES.paperSize, label: "Paper size" },
    orientation: { values: SETTING_CHOICES.orientation, label: "Orientation" },
    mode: { values: SETTING_CHOICES.mode, label: "Output mode" },
    dpi: { minimum: MINIMUM_DPI, maximum: MAXIMUM_DPI, label: "DPI" },
    quality: { minimum: MINIMUM_QUALITY, maximum: MAXIMUM_QUALITY, label: "Quality" }
};

function settingIssue(field, value) {
    const rule = RULES[field];
    if (field === "background") {
        try {
            normalizeColour(value);
            return null;
        } catch {
            return { field, code: "colour", stage: "settings",
                message: "Page background must be six hexadecimal digits, for example #C7DAE8." };
        }
    }
    if (rule.values) {
        return typeof value === "string" && rule.values.includes(value) ? null
            : { field, code: "choice", stage: "settings",
                message: `${rule.label} must be one of: ${rule.values.join(", ")}.` };
    }
    return typeof value === "number" && Number.isInteger(value) &&
        value >= rule.minimum && value <= rule.maximum ? null
        : { field, code: "integer", stage: "settings",
            message: `${rule.label} must be a whole number from ${rule.minimum} to ${rule.maximum}.` };
}

/** All settings issues are returned together; no JSON coercion or aliases. */
function validateSettings(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
        return { issues: [{ code: "object", stage: "settings", message: "Settings must be an object." }] };
    }
    const issues = Object.keys(input).filter((key) => !SETTINGS_FIELDS.includes(key))
        .map((field) => ({ field, code: "unknown", stage: "settings", message: `Unknown setting: ${field}.` }));
    for (const field of SETTINGS_FIELDS) {
        const issue = settingIssue(field, input[field]);
        if (issue) {
            issues.push(issue);
        }
    }
    return issues.length > 0 ? { issues } : { issues: [], settings: {
        paperSize: input.paperSize, orientation: input.orientation, mode: input.mode,
        background: normalizeColour(input.background), dpi: input.dpi, quality: input.quality
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

function isSeparateMode(settings) {
    return settings.mode === "separate";
}

module.exports = { SETTING_CHOICES, DEFAULT_SETTINGS, SETTINGS_FIELDS, settingIssue, validateSettings,
    normalizeSettings, isSeparateMode };
