"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { collectSettings } = require("../../../src/host/settings-form.js");
const { defaultAnswers } = require("../../../src/host/settings-model.js");
const { createFakeApp } = require("../ports/fake-app.cjs");

const BRIDGE = { objc: {}, ns: {} };


test("native cancellation wins over valid answers and never invokes fallback", () => {
    const app = createFakeApp();
    let presentations = 0;
    const present = () => {
        presentations += 1;
        assert.equal(presentations, 1, "a cancelled form must not be shown again");

        return { cancelled: true, answers: defaultAnswers() };
    };

    assert.throws(() => collectSettings(app, {}, BRIDGE, present), /User cancelled/u);
    assert.equal(presentations, 1);
    assert.deepEqual(app.listPrompts, []);
    assert.deepEqual(app.dialogs, []);
});
