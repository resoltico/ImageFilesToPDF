"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { formSpec, defaultAnswers } = require("../../../src/core/form.js");
const { buildForm } = require("../../../src/runtime/appkit-form.js");
const { WIDGETS } = require("../../../src/runtime/appkit.js");
const { createFakeObjC } = require("./fake-objc.cjs");

test("every input has a meaningful accessible name and its applicable choices or rule", () => {
    const spec = formSpec();
    const { controls } = buildForm(createFakeObjC(), spec, WIDGETS);

    for (const row of spec.rows) {
        assert.equal(controls[row.key].accessibilityLabel, row.label);
        assert.equal(controls[row.key].accessibilityHelp,
            row.hint ?? row.options.map((option) => option.label).join("; "));
    }
    assert.match(controls.mode.accessibilityHelp, /one image per page/u);
});

test("invalid inputs expose their state without dropping their correction guidance", () => {
    const spec = formSpec(defaultAnswers(), [{ key: "dpi", message: "Bad DPI" }]);
    const { controls } = buildForm(createFakeObjC(), spec, WIDGETS);

    assert.equal(controls.dpi.accessibilityHelp,
        "Invalid value. Correct this setting. 72–1041 DPI");
    assert.ok(!controls.quality.accessibilityHelp.includes("Invalid"));
});
