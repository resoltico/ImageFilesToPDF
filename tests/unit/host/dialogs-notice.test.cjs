"use strict";

/*
 * How a notice is presented, as distinct from what it says.
 *
 * A completion dialog reports; it does not ask. Getting the buttons wrong
 * gives a person a Cancel for something already finished, and getting the
 * joining wrong runs several failures together into one sentence.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { promptInteger } = require("../../../src/host/prompts.js");
const { RESOLUTION } = require("../../../src/host/settings-model.js");
const { readAnswers } = require("../../../src/host/settings-model.js");
const { defaultAnswers } = require("../../../src/host/settings-model.js");
const { createFakeApp } = require("../ports/fake-app.cjs");

test("a rejected answer is explained where it is corrected", () => {
    // This used to be a dialog of its own: it interrupted mid-answer, and the
    // prompt behind it came back with the typed value replaced by the
    // default -- so the one thing worth keeping, the value being corrected,
    // was the one thing thrown away. The reason now leads the prompt that
    // asks again, with what was typed still in it, and the Cancel on that
    // prompt is honoured where the notice's never was.
    const app = createFakeApp();

    app.nextAnswer = ["3O0", "600"];
    assert.equal(promptInteger(app, RESOLUTION, "300"), 600);
    assert.equal(app.dialogs.length, 2, "one dialog per attempt, not two");

    const [, again] = app.dialogs;

    assert.equal(
        again.message,
        `DPI must be a whole number from 72 to 1017.\n\n${RESOLUTION.prompt}`,
        "the reason, and then the question again"
    );
    assert.equal(again.options.defaultAnswer, "3O0", "holding what was typed");
    assert.deepEqual(again.options.buttons, ["Cancel", "OK"]);
    assert.equal(again.options.cancelButton, "Cancel");
});

test("the first time of asking has nothing to explain", () => {
    const app = createFakeApp();

    app.nextAnswer = ["600"];
    promptInteger(app, RESOLUTION, "300");
    assert.equal(app.dialogs[0].message, RESOLUTION.prompt);
    assert.equal(
        app.dialogs[0].options.defaultAnswer,
        "300",
        "and offers the setting's own default"
    );
});

test("the sentence a person reads is the same in either front end", () => {
    // The number rule was written three times over, and the form and the
    // dialogs said different things about the same answer.
    const app = createFakeApp();

    app.nextAnswer = ["1500", "600"];
    promptInteger(app, RESOLUTION, "300");

    const { problems } = readAnswers({ ...defaultAnswers(), dpi: "1500" });

    assert.equal(
        app.dialogs[1].message.split("\n")[0],
        problems.find((problem) => problem.key === "dpi").message
    );
});
