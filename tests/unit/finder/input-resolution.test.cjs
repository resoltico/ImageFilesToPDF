"use strict";

/*
 * Turning what Shortcuts hands over into paths: which values become one, and
 * which are not paths at all.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { collectInvocation } = require("../../../src/finder/quick-action/input.js");
const { collectImageFiles } = require("../ports/fake-selection.cjs");
const { createFakeApp } = require("../ports/fake-app.cjs");

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

async function quickAction(app, paths) {
    const selection = paths.map(selectedFile);
    const { inputItems } = collectInvocation(app, [selection, PARAMETERS], false);

    return (await collectImageFiles(app, inputItems)).images;
}

test("an empty envelope reaches the production Finder fallback without an image", async () => {
    const app = createFakeApp();
    assert.deepEqual(await quickAction(app, []), []);
});

test("a Quick Action reports the files it will not convert", async () => {
    // Shortcuts appends its parameters to every input; that object is not a
    // file the user asked for and must not be reported as one.
    const app = createFakeApp();
    const selection = ["/a/photo.jpg", "/a/anim.gif"].map(selectedFile);
    const { inputItems } = collectInvocation(app, [selection, PARAMETERS], false);
    const { images, rejected } = (await collectImageFiles(app, inputItems));

    assert.deepEqual(images.map((record) => record.originalName), ["photo.jpg"]);
    assert.deepEqual(rejected.map((entry) => entry.name), ["anim.gif"]);
    assert.ok(
        !rejected.some((entry) => entry.name.includes("object Object")),
        "host metadata is not a rejection"
    );
});

test("interactive envelopes produce an explicitly interactive request", () => {
    assert.deepEqual(collectInvocation(createFakeApp(), [["/a/photo.png"], {}]), { timestamp: "", inputItems: ["/a/photo.png"] });
});
