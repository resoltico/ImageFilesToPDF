"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    completionMessage,
    showCompletion
} = require("../../../src/runtime/completion.js");
const { createFakeApp } = require("./fake-app.cjs");
const { VERSION } = require("../../../src/core/version.js");

test("completionMessage reports a single PDF", () => {
    const message = completionMessage(
        "single",
        { outputs: ["/a/out.pdf"], failures: [], elapsed: "2 seconds" },
        3
    );

    assert.match(message, /Created 1 PDF with 3 pages/u);
    assert.match(message, /\/a\/out\.pdf/u);
    assert.match(message, /Image Files to PDF \d+\.\d+\.\d+/u);
});

test("completionMessage reports separate PDFs and their failures", () => {
    const clean = completionMessage(
        "separate",
        {
            outputs: ["/Users/someone/Pictures/a.pdf", "/Users/someone/Pictures/b.pdf"],
            failures: [],
            elapsed: "1 second"
        },
        2
    );

    assert.match(clean, /Created 2 single-page PDFs\./u);
    assert.match(clean, /\/Users\/someone\/Pictures\//u, "the folder they went to");

    const failures = Array.from({ length: 15 }, (ignored, index) => ({ name: `img${index}.png`, message: "broke" }));
    const withErrors = completionMessage(
        "separate",
        { outputs: [], failures, elapsed: "1 second" },
        15
    );

    assert.match(withErrors, /Finished with errors/u);
    assert.match(withErrors, /Could not convert 15 images:/u);
    assert.match(withErrors, /and 3 more failures/u);
});

test("showCompletion puts the message in a dialog", () => {
    const app = createFakeApp();

    showCompletion(app, "single", { outputs: ["/a.pdf"], failures: [], elapsed: "1 second" }, 1);
    assert.match(app.dialogs[0].message, /Created 1 PDF/u);
    assert.equal(app.dialogs[0].options.buttons.length, 1, "acknowledgement only");
});

test("the failure list is truncated at the documented limit", () => {
    // `>` rather than `>=`: with exactly the limit, nothing is elided.
    const exactly = Array.from({ length: 12 }, (ignored, index) => ({ name: `f${index}`, message: "broke" }));
    const atLimit = completionMessage(
        "separate",
        { outputs: [], failures: exactly, elapsed: "1 second" },
        12
    );

    assert.ok(!/more failure/u.test(atLimit), "no elision at exactly the limit");

    const overLimit = completionMessage(
        "separate",
        { outputs: [], failures: [...exactly, { name: "f12", message: "broke", command: "" }], elapsed: "1 second" },
        13
    );

    assert.match(overLimit, /and 1 more failure/u);
});

test("the completion wording is exactly what was designed", () => {
    // The copy is a deliberate decision — what was produced, where it went,
    // how long it took — so it is pinned rather than sampled. A change here
    // should be a change someone meant to make.
    const single = completionMessage(
        "single",
        {
            outputs: ["/Users/someone/Desktop/output_20260904_120000.pdf"],
            failures: [],
            elapsed: "3 seconds"
        },
        4
    );

    assert.equal(single, [
        "Created 1 PDF with 4 pages.\n" +
            "Saved to: /Users/someone/Desktop/output_20260904_120000.pdf",
        "Elapsed: 3 seconds",
        `Image Files to PDF ${VERSION}`
    ].join("\n\n"));
});

test("the separate and failure wordings are pinned too", () => {
    const separate = completionMessage(
        "separate",
        {
            outputs: ["/Users/someone/Pictures/a.pdf", "/Users/someone/Pictures/b.pdf"],
            failures: [],
            elapsed: "5 seconds"
        },
        2
    );

    assert.equal(separate, [
        "Created 2 single-page PDFs.\nSaved to: /Users/someone/Pictures/",
        "Elapsed: 5 seconds",
        `Image Files to PDF ${VERSION}`
    ].join("\n\n"));

    const failed = completionMessage(
        "separate",
        { outputs: ["/a/x.pdf"], failures: [{ name: "b.png", message: "broke", command: "" }], elapsed: "1 second" },
        2
    );

    assert.equal(failed, [
        "Finished with errors.",
        // Where the PDFs that were made actually went: a run with failures
        // still produced files, and they have to be findable.
        "Created 1 single-page PDF.\nSaved to: /a/",
        "Could not convert 1 image:\nb.png: broke",
        "Elapsed: 1 second",
        `Image Files to PDF ${VERSION}`
    ].join("\n\n"));
});
