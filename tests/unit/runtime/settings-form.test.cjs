"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    collectViaForm,
    collectSettings
} = require("../../../src/runtime/settings-form.js");
const { defaultAnswers } = require("../../../src/core/form.js");
const { createFakeHost } = require("./fake-host.cjs");

const BRIDGE = { objc: {}, ns: {} };

/*
 * Stands in for the AppKit form: answers each presentation in turn, and
 * records the spec it was shown so a redisplay can be inspected.
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

test("the form's answers become the settings", () => {
    const present = scripted([{ answers: defaultAnswers() }]);

    assert.deepEqual(collectViaForm(BRIDGE, present), {
        paperSize: "A4",
        orientation: "Portrait",
        mode: "Single PDF",
        background: "#FFFFFF",
        dpi: 300,
        quality: 92
    });
    assert.equal(present.seen.length, 1, "one good answer needs one form");
    assert.match(
        present.seen[0].detail,
        /Choose how the pages are built/u,
        "the first form has nothing to complain about yet"
    );
});

test("a bad answer redisplays the form with the problem and the rest intact", () => {
    const typed = { ...defaultAnswers(), paperSize: "US Letter", dpi: "nope" };
    const present = scripted([
        { answers: typed },
        { answers: { ...typed, dpi: "600" } }
    ]);
    const settings = collectViaForm(BRIDGE, present);

    assert.equal(settings.dpi, 600);
    assert.equal(settings.paperSize, "Letter", "the good answers must survive");
    assert.equal(present.seen.length, 2);

    const [, redisplayed] = present.seen;
    const paperRow = redisplayed.rows.find((row) => row.key === "paperSize");

    assert.match(redisplayed.detail, /enter a whole number from 72 to 1041/u);
    assert.equal(paperRow.value, "US Letter");
});

test("cancelling the form cancels the run", () => {
    assert.throws(
        () => collectViaForm(BRIDGE, scripted([{ cancelled: true }])),
        /User cancelled/u
    );
});

test("a form that could not be presented is not an answer", () => {
    assert.equal(collectViaForm(BRIDGE, scripted([null])), null);
});

test("without AppKit the stepwise dialogs still collect the settings", () => {
    // The fallback exists because the form displaying is a fact about this
    // macOS, not a promise about the next one.
    const host = createFakeHost({});
    const refuse = () => {
        throw new Error("the form must not be reached without a bridge");
    };
    const settings = collectSettings(host, null, refuse);

    assert.equal(settings.paperSize, "A4");
    assert.ok(host.listPrompts.length > 0, "the dialogs must have been used");
});

test("a form that cannot present falls back rather than failing the run", () => {
    const host = createFakeHost({});

    assert.ok(collectSettings(host, BRIDGE, scripted([null])).paperSize);
    assert.ok(host.listPrompts.length > 0);
});

test("a form that throws falls back too", () => {
    const host = createFakeHost({});
    const broken = () => {
        throw new Error("NSAlert exploded");
    };

    assert.ok(collectSettings(host, BRIDGE, broken).paperSize);
    assert.ok(host.listPrompts.length > 0);
});

test("but a cancellation is honoured, not turned into dialogs", () => {
    // Falling back here would ask a person who just said no to answer six
    // more questions.
    const host = createFakeHost({});

    assert.throws(
        () => collectSettings(host, BRIDGE, scripted([{ cancelled: true }])),
        /User cancelled/u
    );
    assert.equal(host.listPrompts.length, 0);
});

test("the form is preferred when it works", () => {
    const host = createFakeHost({});
    const settings = collectSettings(
        host,
        BRIDGE,
        scripted([{ answers: { ...defaultAnswers(), paperSize: "US Letter" } }])
    );

    assert.equal(settings.paperSize, "Letter");
    assert.equal(host.listPrompts.length, 0, "no dialog may be raised as well");
});
