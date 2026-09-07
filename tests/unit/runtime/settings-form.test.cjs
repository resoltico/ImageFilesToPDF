"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { collectViaForm } = require("../../../src/runtime/settings-form.js");
const { defaultAnswers } = require("../../../src/core/form.js");

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

    // The first form opens on the defaults rather than on nothing: an empty
    // row has no selection to answer with and nothing to leave alone.
    assert.deepEqual(
        present.seen[0].rows.map((row) => [row.key, row.value, row.invalid]),
        Object.entries(defaultAnswers())
            .map(([key, value]) => [key, value, false])
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
