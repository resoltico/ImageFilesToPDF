"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { reviewSelection, confirmSettings } = require("../../../src/host/quick-action/settings-review.js");
const { normalizeSettings } = require("../../../src/core/settings.js");
const { readAnswers } = require("../../../src/host/quick-action/settings-model.js");
const { defaultAnswers } = require("../../../src/host/quick-action/settings-model.js");
const { createFakeApp } = require("../ports/fake-app.cjs");

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
        "1 item in your selection cannot be included.\n\n" +
        "Not included:\n" +
        "locked: unreadable folder\n\nContinue with 2 images?");
    assert.deepEqual(app.dialogs[0].options.buttons, ["Cancel", "Continue"]);
    assert.equal(app.dialogs[0].options.cancelButton, "Cancel");
    assert.deepEqual(app.commands, [], "review does not touch files");
});

test("canceling either consent dialog is honored", () => {
    const app = { displayDialog: () => ({ buttonReturned: "Cancel" }) };

    assert.throws(() => reviewSelection(app, CONTEXT), /User canceled/u);
    assert.throws(() => confirmSettings(app, SETTINGS, CONTEXT), /User canceled/u);
});

test("fallback confirmation states the actual settings and count", () => {
    const app = createFakeApp();

    assert.equal(confirmSettings(app, SETTINGS, CONTEXT), SETTINGS);
    assert.equal(app.dialogs[0].message, [
        "Create 1 PDF with 2 pages?",
        "Each image gets its own page, centered without cropping. " +
            "The original files ar\ne not changed.",
        "A4, Portrait; 300 ppi; JPEG quality 82.",
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

test("each refusal names the item, its reason and the folder it is in", () => {
    const app = createFakeApp();
    reviewSelection(app, { count: 1, rejected: [
        { path: "/Users/me/Pictures/clip.gif", name: "/Users/me/Pictures/clip.gif", reason: "This file is not a supported format." },
        { path: "/Users/me/Locked/", name: "/Users/me/Locked/", reason: "This item could not be read." },
        { path: "", name: "https://example.com/a.png", reason: "Remote URLs are not supported." }
    ] });
    assert.equal(app.dialogs[0].message, [
        "3 items in your selection cannot be included.",
        "",
        "Not included:",
        "clip.gif: This file is not a supported format.",
        "in /Users/me/Pictures/",
        "",
        "Locked: This item could not be read.",
        "in /Users/me/",
        "",
        "https://example.com/a.png: Remote URLs are not supported.",
        "",
        "Continue with 1 image?"
    ].join("\n"));
});

test("a refusal at the root is in the root folder", () => {
    const { refusalLines } = require("../../../src/host/quick-action/settings-review.js");
    assert.equal(refusalLines({ path: "/a.png", reason: "Gone." }), "a.png: Gone.\nin /");
});
