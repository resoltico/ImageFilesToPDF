"use strict";

/*
 * A package is a folder as far as the shell is concerned -- an .app, a
 * .photoslibrary -- so asking the shell what a selected path was sent the
 * walk inside the bundle and wrote the PDFs in there. The tree tells them
 * apart, and a package is refused whole rather than opened.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { collectImageFiles } = require("../../../src/runtime/admission.js");
const { createFakeApp } = require("./fake-app.cjs");

function treeOf(shape, kinds = {}) {
    return {
        entries: (path) => shape[path] ?? null,
        kind: (path) => kinds[path] ?? (shape[path] ? "directory" : "file"),
        standardize: (path) => path.replace(/\/+$/u, "")
    };
}

function appWith(directories) {
    const app = createFakeApp();

    app.directories = directories;

    return app;
}

function collect(selection, tree) {
    return collectImageFiles(appWith(["/Trip"]), selection, tree);
}

test("a package is refused rather than walked into", () => {
    // An .app or a .photoslibrary is a folder as far as the shell is
    // concerned, so asking the shell sent the walk inside the bundle and the
    // PDFs were written in there.
    const tree = treeOf(
        { "/Trip/Photos.app": ["Contents"], "/Trip/Photos.app/Contents": ["a.png"] },
        { "/Trip/Photos.app": "package" }
    );
    const { images, rejected } = collect(["/Trip/Photos.app"], tree);

    assert.deepEqual(images, []);
    assert.deepEqual(rejected.map((entry) => `${entry.name}: ${entry.reason}`), [
        "Photos.app: a package, not a folder of images"
    ]);
});

test("a photo selected inside a package is still the user's own selection", () => {
    // The package is refused whole, so it covers nothing: what was picked out
    // by hand was picked out by hand.
    const tree = treeOf(
        { "/Trip/Photos.app": ["a.png"] },
        { "/Trip/Photos.app": "package" }
    );
    const { images } = collect(
        ["/Trip/Photos.app", "/Trip/Photos.app/a.png"],
        tree
    );

    assert.deepEqual(images.map((image) => image.path), ["/Trip/Photos.app/a.png"]);
});
