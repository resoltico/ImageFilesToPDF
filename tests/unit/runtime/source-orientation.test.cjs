"use strict";

/*
 * vips turns an image to match its orientation tag as it reads it, while
 * vipsheader reports the width and height as stored. A phone stores a
 * portrait photograph as landscape with a tag saying to turn it, so measuring
 * the stored size measured it on its side -- and it reached the page at a
 * quarter of the area of the same photograph with its pixels already upright.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { readImageSize } = require("../../../src/runtime/image-size.js");
const { createFakeApp, failing } = require("./fake-app.cjs");

test("the size read is the size the image will have, not the size stored", () => {
    // vips turns an image to match its orientation tag as it reads it, while
    // vipsheader reports the width and height as stored. A phone stores a
    // portrait photograph as landscape with a tag saying to turn it, and
    // measuring it on its side put it on the page at a quarter of the area.
    for (const [orientation, expected] of [
        ["1", { width: 400, height: 200 }],
        ["4", { width: 400, height: 200 }],
        ["5", { width: 200, height: 400 }],
        ["6", { width: 200, height: 400 }],
        ["8", { width: 200, height: 400 }],
        ["9", { width: 400, height: 200 }]
    ]) {
        const app = createFakeApp([
            ["'width'", "400\n"],
            ["'height'", "200\n"],
            ["'orientation'", `${orientation}\n`]
        ]);

        assert.deepEqual(
            readImageSize(app, "/v/vipsheader", "/a/x.jpg"),
            expected,
            `orientation ${orientation}`
        );
    }
});

test("an image that carries no orientation at all is upright", () => {
    // A JPEG written without metadata has no orientation field, and this
    // action writes exactly such files; most PNGs have none either. vipsheader
    // names the field it could not find, which is what says the image loaded.
    const app = createFakeApp([
        ["'width'", "400\n"],
        ["'height'", "200\n"],
        ["'orientation'", failing(
            'vips_image_get: field "orientation" not found'
        )]
    ]);

    assert.deepEqual(
        readImageSize(app, "/v/vipsheader", "/a/stripped.jpg"),
        { width: 400, height: 200 }
    );
});

test("an orientation that could not be read is not assumed upright", () => {
    // Anything other than the field being absent is a failure to read the
    // image, and calling it upright would place a turned photograph on its
    // side and report success.
    const app = createFakeApp([
        ["'width'", "400\n"],
        ["'height'", "200\n"],
        ["'orientation'", failing("unable to open for read")]
    ]);

    assert.throws(
        () => readImageSize(app, "/v/vipsheader", "/a/x.png"),
        /reading the image orientation/u
    );
});

test("an image one pixel across is a usable size", () => {
    // The bound is "at least one", not "more than one": a 1-pixel image is
    // small, not invalid, and refusing it would be a lie about the file.
    const app = createFakeApp([["'width'", "1\n"], ["'height'", "1\n"]]);

    assert.deepEqual(
        readImageSize(app, "/v/vipsheader", "/a/dot.png"),
        { width: 1, height: 1 }
    );
});

test("the dimensions are asked for by field, each in its own read", () => {
    // -f is what makes vipsheader answer with the bare value; without it the
    // whole header comes back and nothing parses.
    const app = createFakeApp([["'width'", "1200\n"], ["'height'", "800\n"]]);

    readImageSize(app, "/v/vipsheader", "/a/x.png");
    assert.deepEqual(app.commands, [
        "'/v/vipsheader' '-f' 'width' '/a/x.png'",
        "'/v/vipsheader' '-f' 'height' '/a/x.png'",
        "'/v/vipsheader' '-f' 'orientation' '/a/x.png'"
    ]);
});
