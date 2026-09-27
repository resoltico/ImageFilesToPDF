"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { reviewSelection, confirmSettings } = require("../../../src/runtime/settings-review.js");
const { normalizeSettings } = require("../../../src/core/settings.js");
const { readAnswers } = require("../../../src/core/answers.js");
const { defaultAnswers } = require("../../../src/core/form.js");
const { createFakeApp } = require("./fake-app.cjs");

const SETTINGS = normalizeSettings(readAnswers(defaultAnswers()).settings);
const CONTEXT = {
    count: 2, folders: ["/a/"],
    rejected: [{ name: "locked", reason: "unreadable folder" }]
};

test("selection problems are reviewed separately before any conversion", () => {
    const app = createFakeApp();

    reviewSelection(app, {});
    reviewSelection(app, { rejected: [] });
    assert.deepEqual(app.dialogs, []);
    reviewSelection(app, CONTEXT);
    assert.equal(app.dialogs[0].message,
        "1 item in your selection cannot be included:\n" +
        "locked: unreadable folder\n\nContinue with 2 images?");
    assert.deepEqual(app.dialogs[0].options.buttons, ["Cancel", "Continue"]);
    assert.equal(app.dialogs[0].options.cancelButton, "Cancel");
    assert.deepEqual(app.commands, [], "review does not touch files");
});

test("cancelling either consent dialog is honoured", () => {
    const app = { displayDialog: () => ({ buttonReturned: "Cancel" }) };

    assert.throws(() => reviewSelection(app, CONTEXT), /User cancelled/u);
    assert.throws(() => confirmSettings(app, SETTINGS, CONTEXT), /User cancelled/u);
});

test("fallback confirmation states the actual settings and count", () => {
    const app = createFakeApp();

    assert.equal(confirmSettings(app, SETTINGS, CONTEXT), SETTINGS);
    assert.equal(app.dialogs[0].message, [
        "Create 1 PDF with 2 pages?",
        "Each image gets its own page, centred without cropping. " +
            "The original files are not changed.",
        "A4, Portrait; 300 DPI; JPEG quality 92.",
        "Page background: #FFFFFF.",
        "Save to: /a/"
    ].join("\n"));
    assert.deepEqual(app.dialogs[0].options.buttons, ["Cancel", "Create"]);
    confirmSettings(app, { ...SETTINGS, mode: "separate", paperSize: "Letter" }, CONTEXT);
    assert.match(app.dialogs[1].message, /^Create 2 single-page PDFs\?/u);
    assert.match(app.dialogs[1].message, /US Letter/u);
    confirmSettings(app, SETTINGS, {});
    assert.match(app.dialogs[2].message, /^Create the PDF files\?/u);
});
