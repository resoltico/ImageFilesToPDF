"use strict";

/*
 * The whole path a Finder Quick Action takes, from the value Shortcuts hands
 * to run() through to the list of images.
 *
 * The shape here is not invented: it was captured from a diagnostic run as a
 * Quick Action on four JPEGs, which reported
 * [[file, file, file, file], parameters] with each file an object that
 * stringifies to its POSIX path and has no url() method.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    collectInvocation
} = require("../../../src/runtime/input.js");
const { collectImageFiles } = require("../../../src/runtime/admission.js");
const { createFakeApp } = require("./fake-app.cjs");

globalThis.Application = () => ({ selection: () => [] });

/*
 * Selected files arrive as objects, not strings: they stringify to a path and
 * throw on url(), which is what the diagnostic recorded.
 */
function selectedFile(path) {
    return {
        toString: () => path,
        valueOf: () => path
    };
}

const PARAMETERS = { toString: () => "[object Object]" };

function quickAction(app, paths) {
    const selection = paths.map(selectedFile);
    const { inputItems } = collectInvocation(app, [selection, PARAMETERS], false);

    return collectImageFiles(app, inputItems).images;
}

test("several selected images all reach the pipeline", () => {
    // The reported bug: four images selected produced "No images selected",
    // because the nested array stringified to one comma-joined path that
    // passed every check until the filesystem was asked.
    const app = createFakeApp();
    const records = quickAction(app, [
        "/Users/someone/Downloads/IMG_1545.JPG",
        "/Users/someone/Downloads/IMG_1547.JPG",
        "/Users/someone/Downloads/IMG_1542.JPG",
        "/Users/someone/Downloads/IMG_1538.JPG"
    ]);

    assert.deepEqual(records.map((record) => record.originalName), [
        "IMG_1538.JPG",
        "IMG_1542.JPG",
        "IMG_1545.JPG",
        "IMG_1547.JPG"
    ]);
});

test("one selected image still reaches the pipeline", () => {
    // This case worked before the fix and must keep working: it is the reason
    // the bug looked like it was about having several images.
    const app = createFakeApp();
    const records = quickAction(app, ["/Users/someone/Downloads/IMG_1545.JPG"]);

    assert.deepEqual(records.map((record) => record.path), [
        "/Users/someone/Downloads/IMG_1545.JPG"
    ]);
});

test("the trailing parameters object is dropped, not resolved", () => {
    // It is not a file and never was. Nothing may treat it as one, and it
    // must not abort the run either.
    const app = createFakeApp();
    const records = quickAction(app, ["/a/photo.jpg"]);

    assert.equal(records.length, 1);
    assert.ok(
        !records.some((record) => record.path.includes("object Object")),
        "the parameters object must not become an image"
    );
});

test("no image is ever a comma-joined list of images", () => {
    const app = createFakeApp();

    for (const record of quickAction(app, ["/a/1.jpg", "/a/2.jpg", "/a/3.jpg"])) {
        assert.ok(
            !record.path.includes(","),
            `${record.path} is several paths pretending to be one`
        );
    }
});

test("unsupported files in the selection are still filtered out", () => {
    const app = createFakeApp();
    const records = quickAction(app, ["/a/1.jpg", "/a/notes.txt", "/a/2.png"]);

    assert.deepEqual(records.map((record) => record.path), ["/a/1.jpg", "/a/2.png"]);
});
