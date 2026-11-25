"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { SETTINGS_FIELDS, SETTINGS_SCHEMA, PDF_MODE } = require("../../../src/core/settings.js");

test("the documented settings order and kinds are canonical", () => {
    assert.deepEqual(SETTINGS_FIELDS, ["mode", "paperSize", "orientation", "resolutionLimit", "quality", "background"]);
    assert.deepEqual(Object.values(SETTINGS_SCHEMA).map((rule) => rule.kind), ["choice", "choice", "choice", "integer", "integer", "color"]);
    assert.deepEqual(PDF_MODE, { combined: "combined", separate: "separate" });
});

test("setting issues preserve GUI wording and carry authoritative missing/type facts", () => {
    const { settingIssue } = require("../../../src/core/settings.js");
    assert.deepEqual(settingIssue("quality", undefined).diagnostic, { missing: true });
    const wrong = settingIssue("resolutionLimit", "300");
    assert.equal(wrong.message, "Maximum resolution must be a whole number from 72 to 1017.");
    assert.deepEqual(wrong.diagnostic, { expectedType: "number", actualType: "string" });
    assert.deepEqual(settingIssue("mode", null).diagnostic, { expectedType: "string", actualType: "null" });
    assert.deepEqual(settingIssue("mode", []).diagnostic, { expectedType: "string", actualType: "array" });
    assert.deepEqual(settingIssue("background", {}).diagnostic, { expectedType: "string", actualType: "object" });
    assert.equal(settingIssue("quality", 101).diagnostic, undefined, "wrong ranges are not wrong types");
});

test("missing and mistyped settings are worded for their audience and staged as settings", () => {
    const { validateSettings } = require("../../../src/core/settings.js");
    const byField = (issues) => Object.fromEntries(issues.map((issue) => [issue.field, issue]));
    const form = byField(validateSettings({}).issues);
    const keys = byField(validateSettings({}, "keys").issues);
    assert.equal(form.mode.message, "PDF files must be one of: combined, separate.");
    assert.equal(keys.mode.message, "`mode` is missing.");
    assert.deepEqual(form.mode.diagnostic, { missing: true });
    const typed = byField(validateSettings({ mode: 5, paperSize: "A4", orientation: "Portrait", resolutionLimit: "300", quality: 82, background: "#FFFFFF" }, "keys").issues);
    assert.equal(typed.resolutionLimit.message, "`resolutionLimit` must be a JSON number, not a string.");
    assert.deepEqual(typed.resolutionLimit.diagnostic, { expectedType: "number", actualType: "string" });
    for (const issue of [...Object.values(form), ...Object.values(keys), ...Object.values(typed)]) { assert.equal(issue.stage, "settings"); }
    assert.deepEqual(validateSettings({ mode: "combined", paperSize: "A4", orientation: "Portrait", resolutionLimit: 300, quality: 82, background: "#ffffff" }).issues, []);
});
