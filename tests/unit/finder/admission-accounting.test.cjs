"use strict";

/*
 * Every item the action was handed is accounted for: converted, or refused
 * with a reason. An input that resolved to nothing used to be dropped between
 * the resolution and the admission, so a mixed selection quietly became a
 * smaller job than the one that was asked for.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { collectImageFiles } = require("../ports/fake-selection.cjs");
const { createFakeApp } = require("../ports/fake-app.cjs");
const { treeOf } = require("../ports/fake-tree.cjs");
const { collectInvocation } = require("../../../src/finder/quick-action/input.js");
const { runQuickAction } = require("../../../src/finder/quick-action/main.js");

function engineInputs(items) {
    let received = null;
    runQuickAction(items, {
        application: createFakeApp,
        openProgress: () => ({ diagnostics: [], close: () => undefined }),
        collect: collectInvocation,
        runEngine(inputs) {
            received = inputs;
            return { state: "complete", issues: [], diagnostics: [] };
        },
        result: () => undefined
    });
    return received;
}

test("an input that named itself and did not resolve is reported", async () => {
    // It used to fall between the resolution and the admission: no image
    // record, no rejection, and a smaller job than the one that was asked for.
    const app = createFakeApp();
    const { images, rejected } = (await collectImageFiles(app, [
        "/a/good.png",
        "/a/second.jpg",
        "/a/third.png"
    ], treeOf({}, { "/a/second.jpg": "missing", "/a/third.png": "missing" })));

    assert.deepEqual(images.map((image) => image.originalName), ["good.png"]);
    assert.deepEqual(rejected, [
        {
            path: "/a/second.jpg",
            name: "second.jpg",
            reason: "No file or folder exists at this path.", code: "not-a-path", stage: "selection"
        },
        {
            path: "/a/third.png",
            name: "third.png",
            reason: "No file or folder exists at this path.", code: "not-a-path", stage: "selection"
        }
    ]);
});

test("the parameters object Shortcuts appends is not a rejection", async () => {
    // It is on the input of every Quick Action, has no identity of its own,
    // and the user never asked for it. Reporting it would put a rejection on
    // every single interactive run.
    const app = createFakeApp();
    const { images, rejected } = (await collectImageFiles(app, engineInputs([["/a/good.png"], {}])));

    assert.equal(images.length, 1);
    assert.deepEqual(rejected, []);
});

test("a Finder item that cannot say where it is is still reported", async () => {
    // An object is not automatically host metadata: this one named a place,
    // it just was not one that could be used.
    const app = createFakeApp();
    const { rejected } = (await collectImageFiles(app, engineInputs([{ url: () => "https://example.com/photo.png", toString: () => "remote Finder selection" }])));

    assert.deepEqual(rejected.map((entry) => entry.name), [
        "https://example.com/photo.png"
    ]);
});

test("a folder is reported as a folder, whatever it is called", async () => {
    // It used to be turned away for having the wrong extension -- and one
    // called album.png for not being readable. Neither says what it is.
    const app = createFakeApp();

    const { images, rejected } = (await collectImageFiles(app, [
        "/a/album",
        "/a/album.png",
        "/a/photo.png"
    ], treeOf({ "/a/album": [], "/a/album.png": [] })));

    assert.deepEqual(images.map((image) => image.originalName), ["photo.png"]);
    assert.deepEqual(rejected.map((entry) => `${entry.name}: ${entry.reason}`), [
        "album: This folder contains no supported images.",
        "album.png: This folder contains no supported images."
    ]);
});
