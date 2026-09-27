"use strict";

/*
 * What a completion says about outcomes other than "everything worked":
 * where the PDFs went, what was not converted, and how the two are counted.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { completionMessage } = require("../../../src/runtime/completion.js");
const { VERSION } = require("../../../src/core/version.js");

test("a run that produced nothing does not claim a destination", () => {
    // "Saved to: ..." with no outputs would name a folder nothing was written to.
    const message = completionMessage("separate", {
        outputs: [],
        failures: [{ name: "a.png", message: "broke", command: "" }, { name: "b.png", message: "broke", command: "" }],
        elapsed: "1 second"
    }, 2);

    // Pinned whole: an empty line here is the absence of a destination, and
    // "Saved to:" alone would still pass if something else were put in its place.
    assert.equal(message, [
        "Finished with errors.",
        "No PDF was created.",
        "Could not convert 2 images:\na.png: broke\nb.png: broke",
        "Elapsed: 1 second",
        `Image Files to PDF ${VERSION}`
    ].join("\n\n"));
});

test("a combined run that failed says no PDF, not zero single-page PDFs", () => {
    const message = completionMessage("single", {
        outputs: [],
        failures: [{ name: "a.png", message: "broke", command: "" }],
        elapsed: "1 second"
    }, 3);

    assert.match(message, /^Finished with errors\.\n\nNo PDF was created\.\n\n/u);
    assert.ok(!message.includes("single-page"), message);
    assert.ok(!message.includes("Saved to"), message);
});

test("a result predating the rejection list still reports", () => {
    // Absent is not empty; defaulting the other way would throw on a result
    // built before the field existed.
    const message = completionMessage("single", {
        outputs: ["/a/out.pdf"],
        failures: [],
        elapsed: "1 second"
    }, 1);

    assert.match(message, /Created 1 PDF with 1 page/u);
    assert.ok(!message.includes("Not converted"), message);
});

test("a combined PDF still says what it left out", () => {
    const message = completionMessage("single", {
        outputs: ["/a/out.pdf"],
        failures: [],
        rejected: [{ name: "anim.gif", reason: "not a supported format" }],
        elapsed: "1 second"
    }, 2);

    assert.match(message, /Created 1 PDF with 2 pages/u);
    assert.match(message,
        /\n\nNot included from your selection:\nanim\.gif: not a supported format\n\n/u);
});

test("failed images and rejected selection items are distinct counts", () => {
    // A rejected folder is not one failed image; the units must stay distinct.
    const message = completionMessage("separate", {
        outputs: ["/a/one.pdf"],
        failures: [{ name: "b.png", message: "broke", command: "" }],
        rejected: [{ name: "c.gif", reason: "not a supported format" }],
        elapsed: "1 second"
    }, 3);

    assert.match(message, /\n\nCould not convert 1 image:\nb\.png: broke\n\n/u);
    assert.match(message,
        /\n\nNot included from your selection:\nc\.gif: not a supported format\n\n/u);
});

test("outputs spread across folders name every folder", () => {
    // Separate output follows its source, so a selection spanning two folders
    // puts PDFs in two folders. Naming only the first said the rest were
    // somewhere they are not.
    const message = completionMessage("separate", {
        outputs: ["/a/one.pdf", "/b/two.pdf", "/a/three.pdf"],
        failures: [],
        elapsed: "1 second"
    }, 3);

    // One per line: run together, "/a//b/" names a folder that does not exist.
    assert.match(message, /2 folders:\n\/a\/\n\/b\/\n/u, message);
});

test("outputs in one folder name it plainly, not as a list", () => {
    const message = completionMessage("separate", {
        outputs: ["/a/one.pdf", "/a/two.pdf"],
        failures: [],
        elapsed: "1 second"
    }, 2);

    assert.ok(!message.includes("folders:"), message);
    assert.match(message, /Saved to: \/a\/\n/u);
});

test("a rejection list at the limit is not summarised", () => {
    // "...and 0 more." is a line about nothing, and it reads as if something
    // was withheld. The summary belongs only where something was.
    const rejected = Array.from({ length: 12 }, (unused, index) => ({
        name: `x${index}.gif`,
        reason: "not a supported format"
    }));
    const message = completionMessage("separate", {
        outputs: [],
        failures: [{ name: "a.png", message: "broke", command: "" }],
        rejected,
        elapsed: "1 second"
    }, 1);

    assert.ok(!message.includes("more."), message);
    assert.match(message, /x11\.gif/u, "the twelfth is shown, not withheld");
});

test("a rejection list past the limit says how many were withheld", () => {
    const rejected = Array.from({ length: 14 }, (unused, index) => ({
        name: `x${index}.gif`,
        reason: "not a supported format"
    }));
    const message = completionMessage("separate", {
        outputs: [],
        failures: [{ name: "a.png", message: "broke", command: "" }],
        rejected,
        elapsed: "1 second"
    }, 1);

    assert.match(message, /\.\.\.and 2 more\./u, message);
    assert.ok(!message.includes("x12.gif"), "and stops where it says it does");
});
