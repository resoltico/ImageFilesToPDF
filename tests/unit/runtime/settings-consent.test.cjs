"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { settingsFor, collectSettings } = require("../../../src/runtime/settings-form.js");
const { defaultAnswers } = require("../../../src/core/form-rows.js");
const { createFakeApp } = require("./fake-app.cjs");

const BRIDGE = { objc: {}, ns: {} };
const CONTEXT = {
    count: 2,
    rejected: [{ name: "unreadable.png", reason: "Cannot read this file" }]
};

function tracedMemory(events) {
    return () => {
        events.push("open memory");

        return {
            recall() { events.push("recall"); return ""; },
            remember() { events.push("remember"); }
        };
    };
}

test("selection consent happens before settings or memory, and cancellation stops both", () => {
    const events = [];
    const app = createFakeApp();

    app.displayDialog = (message, options) => {
        events.push("review");
        assert.match(message, /unreadable\.png/u);
        assert.match(message, /Continue with 2 images/u);
        assert.equal(options.cancelButton, "Cancel");

        return { buttonReturned: "Cancel" };
    };
    const present = () => {
        events.push("form");

        return { answers: defaultAnswers() };
    };

    assert.throws(() => settingsFor(app, {}, CONTEXT, {
        openMemory: tracedMemory(events), bridge: BRIDGE, present
    }), /User cancelled/u);
    assert.deepEqual(events, ["review"]);
});

test("accepted selection is reviewed before the form and saved only after Create", () => {
    const events = [];
    const app = createFakeApp();

    app.displayDialog = () => {
        events.push("review");

        return { buttonReturned: "Continue" };
    };
    const present = () => {
        events.push("form");

        return { answers: defaultAnswers() };
    };

    settingsFor(app, {}, CONTEXT, {
        openMemory: tracedMemory(events), bridge: BRIDGE, present
    });
    assert.deepEqual(events, ["review", "open memory", "recall", "form", "remember"]);
});

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
