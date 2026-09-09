"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { collectSettings } = require("../../../src/runtime/settings-form.js");
const { defaultAnswers } = require("../../../src/core/form.js");
const { createFakeHost } = require("./fake-host.cjs");

const BRIDGE = { objc: {}, ns: {} };

/*
 * Which front end asks the questions: the form when it can be presented, the
 * stepwise dialogs when it cannot, and neither when the user cancels.
 */
function scripted(outcomes) {
    const seen = [];
    const present = (bridge, spec) => {
        seen.push(spec);

        return outcomes.shift();
    };

    present.seen = seen;

    return present;
}

test("without AppKit the stepwise dialogs still collect the settings", () => {
    // The fallback exists because the form displaying is a fact about this
    // macOS, not a promise about the next one.
    const host = createFakeHost({});
    const attempts = [];
    const refuse = () => {
        attempts.push("presented");

        throw new Error("the form must not be reached without a bridge");
    };
    const settings = collectSettings(host, {}, null, refuse);

    assert.equal(settings.paperSize, "A4");
    assert.ok(host.listPrompts.length > 0, "the dialogs must have been used");
    // Not attempted and then recovered from: without AppKit there is nothing
    // to present to, and trying is how a run dies in a way no one can see.
    assert.deepEqual(attempts, []);
});

test("a form that cannot present falls back rather than failing the run", () => {
    const host = createFakeHost({});

    assert.ok(collectSettings(host, {}, BRIDGE, scripted([null])).paperSize);
    assert.ok(host.listPrompts.length > 0);
});

test("a form that throws falls back too", () => {
    const host = createFakeHost({});
    const broken = () => {
        throw new Error("NSAlert exploded");
    };

    assert.ok(collectSettings(host, {}, BRIDGE, broken).paperSize);
    assert.ok(host.listPrompts.length > 0);
});

test("but a cancellation is honoured, not turned into dialogs", () => {
    // Falling back here would ask a person who just said no to answer six
    // more questions.
    const host = createFakeHost({});

    assert.throws(
        () => collectSettings(host, {}, BRIDGE, scripted([{ cancelled: true }])),
        /User cancelled/u
    );
    assert.equal(host.listPrompts.length, 0);
});

test("the form is preferred when it works", () => {
    const host = createFakeHost({});
    const settings = collectSettings(
        host,
        {},
        BRIDGE,
        scripted([{ answers: { ...defaultAnswers(), paperSize: "US Letter" } }])
    );

    assert.equal(settings.paperSize, "Letter");
    assert.equal(host.listPrompts.length, 0, "no dialog may be raised as well");
});

test("the image count reaches the form that asks the questions", () => {
    // It is the only number that turns a folder selection from a leap into a
    // decision, and Cancel is the escape hatch.
    const present = scripted([{ answers: defaultAnswers() }]);

    collectSettings(createFakeHost({}), { count: 231 }, BRIDGE, present);

    assert.match(present.seen[0].detail, /^231 images\. /u);
});
