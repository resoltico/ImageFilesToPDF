"use strict";

/*
 * More than one name for one file.
 *
 * A Mac gives them out freely: it is case-insensitive as formatted, and a
 * hard link is another name for the same file with no mark on it. What the
 * filesystem says the file is settles whether it is converted twice -- but it
 * must not settle whether a request is answered at all, and a link is not
 * followed here for the same reason the walk does not follow one.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { collectImageFiles } = require("../../../src/runtime/admission.js");
const { createFakeApp } = require("./fake-app.cjs");
const { treeOf } = require("./fake-tree.cjs");

const ONE_FILE = "16777232:5";

function collect(selection, tree) {
    const { images, rejected } = collectImageFiles(createFakeApp(), selection, tree);

    return {
        images: images.map((image) => image.path),
        rejected: rejected.map((entry) => `${entry.name}: ${entry.reason}`)
    };
}

test("a name this action cannot convert does not silence another that it can", () => {
    // Two hard links to one photograph, one named .jpg and one .backup. Keyed
    // by the file, the first spelling was the only one considered -- and
    // whether that spelling was convertible had not been asked yet, so the
    // .jpg vanished from the run without being converted or reported.
    const tree = treeOf({}, {}, {
        "/a/image.jpg": ONE_FILE,
        "/a/image.backup": ONE_FILE
    });

    for (const selection of [
        ["/a/image.backup", "/a/image.jpg", "/a/extra.jpg"],
        ["/a/image.jpg", "/a/image.backup", "/a/extra.jpg"]
    ]) {
        const { images, rejected } = collect(selection, tree);

        assert.deepEqual(images, ["/a/extra.jpg", "/a/image.jpg"], selection.join(" then "));
        assert.deepEqual(rejected, [
            "image.backup: not a supported format (JPEG, PNG, HEIC, TIFF, WebP or AVIF)"
        ], selection.join(" then "));
    }
});

test("one photograph under two names it can convert is converted once", () => {
    const tree = treeOf({}, {}, { "/a/A.jpg": ONE_FILE, "/a/a.jpg": ONE_FILE });

    for (const selection of [["/a/A.jpg", "/a/a.jpg"], ["/a/a.jpg", "/a/A.jpg"]]) {
        const { images, rejected } = collect(selection, tree);

        assert.equal(images.length, 1, selection.join(" then "));
        assert.equal(images[0], selection[0], "under the name it was first asked for by");
        assert.deepEqual(rejected, []);
    }
});

test("a link is refused rather than followed", () => {
    // The walk passes over links because following one is how a run leaves
    // the folder it was given and how it converts the same photograph twice.
    // Asking the shell instead followed it -- test -f reports on the target --
    // so a link and the file it points to were two images.
    const tree = treeOf({}, { "/a/link.jpg": "other" }, {
        "/a/image.jpg": "16777232:8",
        "/a/link.jpg": "16777232:9"
    });
    const { images, rejected } = collect(["/a/image.jpg", "/a/link.jpg"], tree);

    assert.deepEqual(images, ["/a/image.jpg"]);
    assert.deepEqual(rejected, ["link.jpg: a link; select the file it points to"]);
});

test("a link inside a selected folder is refused when it is selected too", () => {
    // Discovery skips it; admission used to accept it afterwards, which put
    // the photograph it points to in the PDF a second time.
    const tree = treeOf(
        { "/a": ["image.jpg", "link.jpg"] },
        { "/a/link.jpg": "other" },
        { "/a/image.jpg": "16777232:8", "/a/link.jpg": "16777232:9" }
    );
    const app = createFakeApp();

    app.directories = ["/a"];

    const { images, rejected } = collectImageFiles(app, ["/a", "/a/link.jpg"], tree);

    assert.deepEqual(images.map((image) => image.path), ["/a/image.jpg"]);
    assert.deepEqual(
        rejected.map((entry) => entry.reason),
        ["a link; select the file it points to"]
    );
});
