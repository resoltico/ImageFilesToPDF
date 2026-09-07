"use strict";

/*
 * A request made by hand is answered by hand.
 *
 * Selecting a folder covers what the walk takes from it, and the walk does
 * not take everything: it passes over hidden entries, packages and links, and
 * it says nothing about files that are not images. Dropping an explicit
 * request because a selected folder sits above it therefore removed it from
 * the run entirely -- a photograph whose name began with a dot did not appear
 * in the PDF and did not appear in the report, and the run said it had
 * succeeded.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { collectImageFiles } = require("../../../src/runtime/admission.js");
const { createFakeApp } = require("./fake-app.cjs");
const { treeOf } = require("./fake-tree.cjs");

function collect(selection, tree, directories = ["/photos"]) {
    const app = createFakeApp();

    app.directories = directories;

    const { images, rejected } = collectImageFiles(app, selection, tree);

    return {
        images: images.map((image) => image.path),
        rejected: rejected.map((entry) => `${entry.name}: ${entry.reason}`)
    };
}

// Both orders, because the answer must not depend on which arrived first.
function bothWays(one, other) {
    return [[one, other], [other, one]];
}

test("a hidden image selected by hand is converted, folder or no folder", () => {
    const tree = treeOf({ "/photos": ["a.jpg", ".evidence.jpg"] });

    for (const selection of bothWays("/photos", "/photos/.evidence.jpg")) {
        assert.deepEqual(
            collect(selection, tree).images,
            ["/photos/.evidence.jpg", "/photos/a.jpg"],
            selection.join(" then ")
        );
    }
});

test("a file that cannot be converted still says so when its folder is selected too", () => {
    // Selected alone it is reported. Selected alongside its folder it used to
    // stop being reported, which is the silent filter this action exists not
    // to have.
    const tree = treeOf({ "/photos": ["a.jpg", "readme.txt"] });

    for (const selection of bothWays("/photos", "/photos/readme.txt")) {
        const { images, rejected } = collect(selection, tree);

        assert.deepEqual(images, ["/photos/a.jpg"]);
        assert.deepEqual(rejected, [
            "readme.txt: not a supported format (JPEG, PNG, HEIC, TIFF, WebP or AVIF)"
        ]);
    }
});

test("a hidden folder selected by hand is walked", () => {
    // Hidden-ness governs what a walk discovers, not what a person selects.
    const tree = treeOf({
        "/photos": [".old"],
        "/photos/.old": ["b.jpg"]
    });

    for (const selection of bothWays("/photos", "/photos/.old")) {
        assert.deepEqual(
            collect(selection, tree, ["/photos", "/photos/.old"]).images,
            ["/photos/.old/b.jpg"],
            selection.join(" then ")
        );
    }
});

test("an image the walk already took is not converted twice", () => {
    // The ledger, not the pathname, decides: it was asked for and it is in
    // the run, which is neither a rejection nor a second copy.
    const tree = treeOf({ "/photos": ["a.jpg", "b.jpg"] });

    for (const selection of bothWays("/photos", "/photos/a.jpg")) {
        const { images, rejected } = collect(selection, tree);

        assert.deepEqual(images, ["/photos/a.jpg", "/photos/b.jpg"]);
        assert.deepEqual(rejected, []);
    }
});

test("an entry the walk could not look at is reported by name", () => {
    const tree = treeOf(
        { "/photos": ["a.jpg", "b.jpg"] },
        { "/photos/b.jpg": "missing" }
    );
    const { images, rejected } = collect(["/photos"], tree);

    assert.deepEqual(images, ["/photos/a.jpg"]);
    assert.deepEqual(rejected, ["b.jpg: could not be examined"]);
});

test("a subfolder that could not be looked at is reported as well", () => {
    const tree = treeOf(
        { "/photos": ["a.jpg", "sub"], "/photos/sub": ["b.jpg"] },
        { "/photos/sub": "missing" }
    );
    const { images, rejected } = collect(["/photos"], tree);

    assert.deepEqual(images, ["/photos/a.jpg"]);
    assert.deepEqual(rejected, ["sub: could not be examined"]);
});
