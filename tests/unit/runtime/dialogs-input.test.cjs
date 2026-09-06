"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { promptInteger } = require("../../../src/runtime/dialogs.js");
const { RESOLUTION } = require("../../../src/core/choices.js");
const { createFakeApp } = require("./fake-app.cjs");

test("promptInteger accepts a value inside the range", () => {
    const app = createFakeApp();

    app.nextAnswer = " 300 ";
    assert.equal(promptInteger(app, RESOLUTION), 300);
    assert.match(app.dialogs[0].message, /Resolution in DPI \(72–1041\)/u);
});

test("promptInteger re-asks until the answer is valid", () => {
    const app = createFakeApp();
    const answers = ["abc", "5000", "-1", "600"];
    let index = 0;

    app.displayDialog = (message, options) => {
        app.dialogs.push({ message, options });

        // Only the prompt itself consumes an answer; the explanatory dialog
        // that follows a rejection has no input field.
        if (!options || options.defaultAnswer === undefined) {
            return { textReturned: "" };
        }

        const answer = answers[Math.min(index, answers.length - 1)];

        index += 1;

        return { textReturned: answer };
    };

    assert.equal(promptInteger(app, RESOLUTION), 600);
    // Three rejections, each followed by an explanatory dialog.
    assert.equal(app.dialogs.filter((dialog) => /whole number/u.test(dialog.message)).length, 3);
});

test("promptInteger accepts the exact ends of the range", () => {
    // The bounds are inclusive; `>` or `<` instead of `>=` or `<=` would
    // reject the very values the prompt advertises.
    for (const answer of ["72", "1041"]) {
        const app = createFakeApp();

        app.nextAnswer = answer;
        assert.equal(promptInteger(app, RESOLUTION), Number(answer));
    }
});

test("promptInteger rejects a number with anything attached to it", () => {
    // Unanchored, "300abc" would parse as 300 and be silently accepted.
    const answers = ["300abc", "abc300", "3 0 0", "1e3", "300.5", "300"];
    const app = createFakeApp();
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

    assert.equal(promptInteger(app, RESOLUTION), 300);
    assert.equal(
        app.dialogs.filter((dialog) => /whole number/u.test(dialog.message)).length,
        5,
        "each malformed answer must be rejected"
    );
});

test("the number prompt identifies the app and can be cancelled", () => {
    const app = createFakeApp();

    app.nextAnswer = "300";
    promptInteger(app, RESOLUTION);

    const [{ options }] = app.dialogs;

    assert.equal(options.withTitle, "Image Files to PDF");
    assert.deepEqual(options.buttons, ["Cancel", "OK"]);
    assert.equal(options.defaultButton, "OK");
    assert.equal(options.cancelButton, "Cancel");
    assert.equal(options.defaultAnswer, "300");
});

test("a number outside the range is refused, not accepted", () => {
    // Without the range check every parsed number would be taken, and the
    // prompt advertises a range it would then ignore.
    const answers = ["71", "1201", "300"];
    const app = createFakeApp();
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

    assert.equal(promptInteger(app, RESOLUTION), 300);
    assert.equal(
        app.dialogs.filter((dialog) => /whole number/u.test(dialog.message)).length,
        2,
        "both out-of-range answers must be refused"
    );
});
