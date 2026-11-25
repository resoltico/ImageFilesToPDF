"use strict";

/*
 * Page preparation steps driven directly: the intermediate file exists only
 * for images with alpha, and the decode check runs only when asked for.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { inspectModule } = require("../ports/inspect-module.cjs");

const { normalizeImage, checkDecode } = inspectModule(require.resolve("../../../src/application/pages.js"), ["normalizeImage", "checkDecode"]);

function pageJob() {
    const removed = [];
    const ran = [];
    return {
        removed, ran,
        tools: { vips: "/v/vips" },
        settings: { background: "#FFFFFF", quality: 85 },
        cleanupIssues: [],
        operations: {
            toolPath: (path) => path,
            run: (argv) => { ran.push(argv); return Promise.resolve(""); },
            verifyFile: () => undefined,
            removeFile: (path) => { removed.push(path); return { state: "removed" }; }
        }
    };
}

const PAGE = { path: "/w/page-0.png", placement: { widthPixels: 10, heightPixels: 10, relativeScale: 1 } };

test("only an image with alpha leaves an intermediate file to remove", async () => {
    const opaque = pageJob();
    await normalizeImage(opaque, { path: "/w/input-0" }, { bands: 3, interpretation: "srgb" }, PAGE);
    assert.deepEqual(opaque.removed, []);
    const alpha = pageJob();
    await normalizeImage(alpha, { path: "/w/input-0" }, { bands: 4, interpretation: "srgb" }, PAGE);
    assert.deepEqual(alpha.removed, ["/w/page-0.png.v"]);
});

test("the decode check runs only when asked for", async () => {
    const skipped = pageJob();
    await checkDecode(skipped, { path: "/w/input-0" }, false);
    assert.deepEqual(skipped.ran, []);
    const checked = pageJob();
    await checkDecode(checked, { path: "/w/input-0" }, true);
    assert.equal(checked.ran.length, 1);
});
