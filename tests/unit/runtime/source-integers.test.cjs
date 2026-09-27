"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { readField, readBandCount, readPageCount } = require("../../../src/runtime/source-image.js");
const { readImageSize } = require("../../../src/runtime/image-size.js");
const { createFakeApp } = require("./fake-app.cjs");

test("image dimensions and band counts do not accept numeric prefixes", () => {
    for (const text of ["2junk", "2.5", "9007199254740992", "0", "-1", "1e3"]) {
        const app = createFakeApp([["vipsheader", text]]);

        assert.throws(() => readField(app, "/v/vipsheader", "/a.png", "width"),
            /invalid width/u, text);
        assert.throws(() => readBandCount(app, "/v/vipsheader", "/a.png"),
            /invalid band count/u, text);
        assert.match(readPageCount(app, "/v/vipsheader", "/a.png").unknown,
            /reported the page count/u, text);
    }
});

test("out-of-range orientation tags cannot silently produce the wrong placement", () => {
    for (const text of ["9", "100", "6junk", "6.5", "0", "-1"]) {
        const app = createFakeApp([["'orientation'", text]]);

        assert.throws(() => readImageSize(app, "/v/vipsheader", "/a.png"),
            /invalid orientation/u, text);
    }
});
