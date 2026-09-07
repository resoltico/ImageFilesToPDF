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
        { outputs: ["/a/out.pdf"], failures: [], elapsed: "2 second(s)" },
        3
    );

    assert.match(message, /Created one PDF from 3 images/u);
    assert.match(message, /\/a\/out\.pdf/u);
    assert.match(message, /Image Files to PDF \d+\.\d+\.\d+/u);
});

test("completionMessage reports separate PDFs and their failures", () => {
    const clean = completionMessage(
        "separate",
        {
            outputs: ["/Users/someone/Pictures/a.pdf", "/Users/someone/Pictures/b.pdf"],
            failures: [],
            elapsed: "1 second(s)"
        },
        2
    );

    assert.match(clean, /Created 2 PDFs\./u);
    assert.match(clean, /\/Users\/someone\/Pictures\//u, "the folder they went to");

    const failures = Array.from({ length: 15 }, (ignored, index) => `img${index}.png: broke`);
    const withErrors = completionMessage(
        "separate",
        { outputs: [], failures, elapsed: "1 second(s)" },
        15
    );

    assert.match(withErrors, /Finished with errors/u);
    assert.match(withErrors, /Failed: 15/u);
    assert.match(withErrors, /and 3 more failure\(s\)/u);
});

test("showCompletion puts the message in a dialog", () => {
    const app = createFakeApp();

    showCompletion(app, "single", { outputs: ["/a.pdf"], failures: [], elapsed: "1 second(s)" }, 1);
    assert.match(app.dialogs[0].message, /Created one PDF/u);
    assert.equal(app.dialogs[0].options.buttons.length, 1, "acknowledgement only");
});

test("the failure list is truncated at the documented limit", () => {
    // `>` rather than `>=`: with exactly the limit, nothing is elided.
    const exactly = Array.from({ length: 12 }, (ignored, index) => `f${index}: broke`);
    const atLimit = completionMessage(
        "separate",
        { outputs: [], failures: exactly, elapsed: "1 second(s)" },
        12
    );

    assert.ok(!/more failure/u.test(atLimit), "no elision at exactly the limit");

    const overLimit = completionMessage(
        "separate",
        { outputs: [], failures: [...exactly, { name: "f12", message: "broke", command: "" }], elapsed: "1 second(s)" },
        13
    );

    assert.match(overLimit, /and 1 more failure\(s\)/u);
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
            elapsed: "3 second(s)"
        },
        4
    );

    assert.equal(single, [
        "Created one PDF from 4 images.",
        "",
        "/Users/someone/Desktop/output_20260904_120000.pdf",
        "",
        "Elapsed: 3 second(s)",
        "",
        `Image Files to PDF ${VERSION}`
    ].join("\n"));
});

test("the separate and failure wordings are pinned too", () => {
    const separate = completionMessage(
        "separate",
        {
            outputs: ["/Users/someone/Pictures/a.pdf", "/Users/someone/Pictures/b.pdf"],
            failures: [],
            elapsed: "5 second(s)"
        },
        2
    );

    assert.equal(separate, [
        "Created 2 PDFs.",
        "",
        "/Users/someone/Pictures/",
        "",
        "Elapsed: 5 second(s)",
        "",
        `Image Files to PDF ${VERSION}`
    ].join("\n"));

    const failed = completionMessage(
        "separate",
        { outputs: ["/a/x.pdf"], failures: [{ name: "b.png", message: "broke", command: "" }], elapsed: "1 second(s)" },
        2
    );

    assert.equal(failed, [
        "Finished with errors.",
        "",
        "Created: 1 PDF",
        "Failed: 1",
        "Elapsed: 1 second(s)",
        "",
        // Where the PDFs that were made actually went, which a failed run
        // used not to say at all.
        "In: /a/",
        "",
        "b.png: broke",
        "",
        `Image Files to PDF ${VERSION}`
    ].join("\n"));
});
