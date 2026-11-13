"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { SETTINGS_FIELDS, SETTINGS_SCHEMA, PDF_MODE } = require("../../../src/core/settings.js");

test("the documented settings order and kinds are canonical", () => {
    assert.deepEqual(SETTINGS_FIELDS, ["mode", "paperSize", "orientation", "resolutionLimit", "quality", "background"]);
    assert.deepEqual(Object.values(SETTINGS_SCHEMA).map((rule) => rule.kind), ["choice", "choice", "choice", "integer", "integer", "color"]);
    assert.deepEqual(PDF_MODE, { combined: "combined", separate: "separate" });
});
