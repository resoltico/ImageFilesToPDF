"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    chooseRequired,
    collectDialogSettings
} = require("../../../src/runtime/dialogs.js");
const { PAPER_SIZE } = require("../../../src/core/choices.js");
const { createFakeApp } = require("./fake-app.cjs");

test("chooseRequired returns the value behind the chosen label", () => {
    // The label is what a person reads; the value is what the pipeline keys
    // on, and the two are deliberately not the same word.
    const app = createFakeApp();

    app.nextChoice = ["US Letter"];
    assert.equal(chooseRequired(app, PAPER_SIZE), "Letter");
    assert.deepEqual(app.listPrompts[0].options, ["A4", "US Letter"]);
    assert.deepEqual(app.listPrompts[0].settings.defaultItems, ["A4"]);
});

test("chooseRequired rejects a label it did not offer", () => {
    const app = createFakeApp();

    app.nextChoice = ["Legal"];
    assert.throws(() => chooseRequired(app, PAPER_SIZE), /Unrecognised choice: Legal/u);
});

test("chooseRequired treats a dismissed list as cancellation", () => {
    const app = createFakeApp();

    app.nextChoice = false;
    assert.throws(() => chooseRequired(app, PAPER_SIZE), /User cancelled/u);
});

test("collectDialogSettings asks for every setting", () => {
    const app = createFakeApp();

    // Valid for both prompts: DPI accepts 72–1041, quality accepts 1–100.
    app.nextAnswer = "92";
    const settings = collectDialogSettings(app);

    assert.deepEqual(Object.keys(settings), [
        "paperSize", "orientation", "dpi", "quality", "mode", "background"
    ]);
    assert.equal(app.listPrompts.length, 4);
});

test("every prompt actually asks something", () => {
    // An empty prompt is a real defect: the dialog still appears, with no
    // indication of what is being chosen.
    const app = createFakeApp();

    app.nextAnswer = "92";
    collectDialogSettings(app);

    for (const prompt of app.listPrompts) {
        assert.ok(prompt.settings.withPrompt.length > 0, "list prompt has text");
        assert.ok(prompt.options.every((option) => option.length > 0));
    }

    for (const dialog of app.dialogs) {
        assert.ok(dialog.message.length > 0, "input dialog has text");
        assert.ok(dialog.options.defaultAnswer.length > 0);
    }
});

test("the prompts name what they are asking about", () => {
    const app = createFakeApp();

    app.nextAnswer = "92";
    collectDialogSettings(app);

    const asked = [
        ...app.listPrompts.map((prompt) => prompt.settings.withPrompt),
        ...app.dialogs.map((dialog) => dialog.message)
    ].join("\n");

    for (const subject of [
        /paper size/iu,
        /orientation/iu,
        /DPI/u,
        /quality/iu,
        /output/iu,
        /background/iu
    ]) {
        assert.match(asked, subject);
    }

    // A rejected answer must not be the first time the range is mentioned.
    assert.match(asked, /72–1041/u);
    assert.match(asked, /1–100/u);
});

test("list prompts identify the app and offer its options", () => {
    // Six anonymous prompts in a row was the reported problem; the title is
    // what fixed it, so it is asserted rather than assumed.
    const app = createFakeApp();

    app.nextChoice = ["A4"];
    chooseRequired(app, PAPER_SIZE);

    const [prompt] = app.listPrompts;

    assert.equal(prompt.settings.withTitle, "Image Files to PDF");
    assert.equal(prompt.settings.withPrompt, "Paper size:");
    assert.deepEqual(prompt.settings.defaultItems, ["A4"]);
});
