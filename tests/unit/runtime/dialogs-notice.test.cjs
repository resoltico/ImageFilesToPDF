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
const {
    completionMessage,
    promptInteger,
    showCompletion
} = require("../../../src/runtime/dialogs.js");
const { RESOLUTION } = require("../../../src/core/choices.js");
const { createFakeApp } = require("./fake-app.cjs");

test("the completion dialog is a notice, not a question", () => {
    // Without the button set macOS supplies a Cancel there is nothing to
    // cancel, and an untitled dialog does not say which action produced it.
    const app = createFakeApp();

    showCompletion(app, "single", {
        outputs: ["/a/out.pdf"],
        failures: [],
        elapsed: "1 second(s)"
    }, 1);

    assert.deepEqual(app.dialogs.at(-1).options, {
        withTitle: "Image Files to PDF",
        buttons: ["OK"],
        defaultButton: "OK"
    });
});

test("each failure keeps its own line", () => {
    // Run together they read as one sentence about a file that does not
    // exist, which is worse than reporting only the first.
    const message = completionMessage("separate", {
        outputs: [],
        failures: ["one.png: broke", "two.png: also broke"],
        elapsed: "1 second(s)"
    }, 2);

    assert.ok(
        message.includes("one.png: broke\ntwo.png: also broke"),
        message
    );
});

test("the retry notice is titled and offers only OK", () => {
    // It interrupts a person mid-answer. A Cancel here would be a second way
    // to abandon the run that the retry loop does not honour.
    const app = createFakeApp();
    const answers = ["0", "300"];
    let index = 0;

    app.displayDialog = (message, options) => {
        app.dialogs.push({ message, options });

        if (!options || options.defaultAnswer === undefined) {
            return { textReturned: "" };
        }

        const answer = answers[Math.min(index, answers.length - 1)];

        index += 1;

        return { textReturned: answer };
    };

    promptInteger(app, RESOLUTION);

    const notice = app.dialogs.find((dialog) =>
        String(dialog.message).includes("Please enter a whole number"));

    assert.ok(notice, "a rejected answer must be explained");
    assert.deepEqual(notice.options, {
        withTitle: "Image Files to PDF",
        buttons: ["OK"],
        defaultButton: "OK"
    });
});
