"use strict";

/*
 * Every item the action was handed is accounted for: converted, or refused
 * with a reason. An input that resolved to nothing used to be dropped between
 * the resolution and the admission, so a mixed selection quietly became a
 * smaller job than the one that was asked for.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { collectImageFiles } = require("../../../src/runtime/admission.js");
const { createFakeApp } = require("./fake-app.cjs");

test("an input that named itself and did not resolve is reported", () => {
    // It used to fall between the resolution and the admission: no image
    // record, no rejection, and a smaller job than the one that was asked for.
    const app = createFakeApp();
    const { images, rejected } = collectImageFiles(app, [
        "/a/good.png",
        "./second.jpg",
        "~/Pictures/third.png"
    ]);

    assert.deepEqual(images.map((image) => image.originalName), ["good.png"]);
    assert.deepEqual(rejected, [
        {
            path: "",
            name: "./second.jpg",
            reason: "not an absolute path to a file"
        },
        {
            path: "",
            name: "~/Pictures/third.png",
            reason: "not an absolute path to a file"
        }
    ]);
});

test("the parameters object Shortcuts appends is not a rejection", () => {
    // It is on the input of every Quick Action, has no identity of its own,
    // and the user never asked for it. Reporting it would put a rejection on
    // every single interactive run.
    const app = createFakeApp();
    const { images, rejected } = collectImageFiles(app, ["/a/good.png", {}]);

    assert.equal(images.length, 1);
    assert.deepEqual(rejected, []);
});

test("a Finder item that cannot say where it is is still reported", () => {
    // An object is not automatically host metadata: this one named a place,
    // it just was not one that could be used.
    const app = createFakeApp();
    const { rejected } = collectImageFiles(app, [
        { url: () => "https://example.com/photo.png" }
    ]);

    assert.deepEqual(rejected.map((entry) => entry.name), [
        "https://example.com/photo.png"
    ]);
});
