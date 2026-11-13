"use strict";

/*
 * Choosing a page background where there is no form.
 *
 * The stepwise path has no control that is a list and a field at once, so the
 * one control the form has becomes two steps here -- without becoming a
 * second way of configuring anything: the same grammar, the same values.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { chooseColor } = require("../../../src/host/quick-action/dialogs.js");
const { createFakeApp } = require("../ports/fake-app.cjs");

test("the fallback offers the four presets and a color of your own", () => {
    const app = createFakeApp();

    app.nextChoice = ["Dark blue (#204486)"];
    assert.equal(chooseColor(app, "#FFFFFF"), "#204486");
    assert.deepEqual(app.listPrompts[0].options, [
        "White (#FFFFFF)",
        "Black (#000000)",
        "Purple (#8E79E0)",
        "Dark blue (#204486)",
        "Custom color..."
    ]);
    assert.deepEqual(app.dialogs, [], "a preset is not asked about twice");
    assert.deepEqual(
        app.listPrompts[0].settings.defaultItems,
        ["White (#FFFFFF)"],
        "and the list opens on the color a run would otherwise use"
    );
});

test("a color of your own is prompted for and read like any other", () => {
    const app = createFakeApp();

    app.nextChoice = ["Custom color..."];
    app.nextAnswer = [" c7dae8 "];
    assert.equal(chooseColor(app, "#FFFFFF"), "#C7DAE8");
    assert.match(app.dialogs[0].message, /six hexadecimal digits/u);
});

test("the color prompt is a question, with an answer and a way out", () => {
    const app = createFakeApp();

    app.nextChoice = ["Custom color..."];
    app.nextAnswer = ["#C7DAE8"];
    chooseColor(app, "#FFFFFF");

    const [prompt] = app.dialogs;

    assert.equal(
        prompt.options.defaultAnswer,
        "#FFFFFF",
        "opening on the color in force, which shows the shape and is one"
    );
    assert.equal(prompt.message, "Page background as six hexadecimal digits:");
    assert.deepEqual(prompt.options.buttons, ["Cancel", "OK"]);
    assert.equal(prompt.options.defaultButton, "OK");
    assert.equal(prompt.options.cancelButton, "Cancel");
});

test("a color that cannot be read is asked again, holding what was typed", () => {
    // A value being corrected is the one thing the person has that the
    // program does not. Asking again with "#" in the box threw it away, so
    // one wrong character meant entering the whole color afresh.
    const app = createFakeApp();

    app.nextChoice = ["Custom color..."];
    app.nextAnswer = ["#C7DAEG", "#C7DAE", "#C7DAE8"];
    assert.equal(chooseColor(app, "#FFFFFF"), "#C7DAE8");
    assert.deepEqual(
        app.dialogs.map((dialog) => dialog.options.defaultAnswer),
        ["#FFFFFF", "#C7DAEG", "#C7DAE"],
        "each attempt is offered back for correction"
    );
});

test("the reason is on the screen that asks again, not on one before it", () => {
    // It used to be a dialog of its own: dismissed, and then a fresh prompt
    // with nothing in it. An answer and what is wrong with it belong on one
    // screen, which is what the form does with its problems.
    const app = createFakeApp();

    app.nextChoice = ["Custom color..."];
    app.nextAnswer = ["#C7DAEG", "#C7DAE8"];
    chooseColor(app, "#FFFFFF");
    assert.equal(app.dialogs.length, 2, "one dialog per attempt, not two");
    assert.equal(
        app.dialogs[1].message,
        "Page background must be six hexadecimal digits, for example #C7DAE8. The # is optional, and transparency is not supported." +
            "\n\n" +
            "Page background as six hexadecimal digits:"
    );
});

test("canceling either step cancels the run", () => {
    const dismissed = createFakeApp();

    dismissed.nextChoice = false;
    assert.throws(() => chooseColor(dismissed), /User canceled/u);

    const canceled = createFakeApp();

    canceled.nextChoice = ["Custom color..."];
    canceled.nextAnswer = [new Error("User canceled.")];
    assert.throws(() => chooseColor(canceled), /User canceled/u);
});
