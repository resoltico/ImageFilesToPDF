"use strict";

/*
 * Turning what Shortcuts hands over into paths: which values become one, and
 * which are not paths at all.
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

test("an item that stringifies to nothing cannot reach Path()", () => {
    // Measured: Path("") does not throw, it raises an ObjC exception that no
    // JavaScript try/catch can intercept, killing the action outright with no
    // dialog. Nothing may hand an empty value to it.
    const app = createFakeApp();

    assert.doesNotThrow(() => quickAction(app, []));

    const { inputItemToPosixPath } = require("../../../src/runtime/input.js");

    for (const empty of ["", { toString: () => "" }]) {
        assert.equal(inputItemToPosixPath(empty), "");
    }
});

test("a relative name is not resolved into a plausible absolute path", () => {
    // Path() would have turned "photo.jpg" into "<cwd>/photo.jpg", which
    // looks resolved and points nowhere the user chose.
    const { inputItemToPosixPath } = require("../../../src/runtime/input.js");

    assert.equal(inputItemToPosixPath("photo.jpg"), "");
    assert.equal(inputItemToPosixPath("Downloads/photo.jpg"), "");
});

test("only a leading file:// makes an item a URL", () => {
    // Unanchored, a name that merely contains the scheme would be decoded as
    // though it were one, quietly changing the path.
    const { inputItemToPosixPath } = require("../../../src/runtime/input.js");

    assert.equal(
        inputItemToPosixPath("/a/notes-about-file://urls.png"),
        "/a/notes-about-file://urls.png"
    );
    assert.equal(inputItemToPosixPath("file:///a/b%20c.png"), "/a/b c.png");
});

test("a Quick Action reports the files it will not convert", () => {
    // Shortcuts appends its parameters to every input; that object is not a
    // file the user asked for and must not be reported as one.
    const app = createFakeApp();
    const selection = ["/a/photo.jpg", "/a/anim.gif"].map(selectedFile);
    const { inputItems } = collectInvocation(app, [selection, PARAMETERS], false);
    const { images, rejected } = collectImageFiles(app, inputItems);

    assert.deepEqual(images.map((record) => record.originalName), ["photo.jpg"]);
    assert.deepEqual(rejected.map((entry) => entry.name), ["anim.gif"]);
    assert.ok(
        !rejected.some((entry) => entry.name.includes("object Object")),
        "host metadata is not a rejection"
    );
});
