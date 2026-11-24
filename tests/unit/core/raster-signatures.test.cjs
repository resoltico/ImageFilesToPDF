"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { Buffer } = require("node:buffer");
const { unknownFormatCode, SIGNATURE_BYTES } = require("../../../src/core/raster-signatures.js");

test("a complete required raster signature changes unknown-format to damaged", () => {
    for (const hex of ["89504e470d0a1a0a", "ffd8ff", "49492a00", "4d4d002a", "52494646deadbeef57454250"]) {
        const prefix = Buffer.from(hex, "hex");
        assert.equal(unknownFormatCode(prefix), "damaged", hex);
        assert.equal(unknownFormatCode(prefix.subarray(0, -1)), "not-an-image", hex);
        assert.equal(unknownFormatCode(Buffer.concat([prefix, Buffer.from("extra")])), "damaged", hex);
    }
    assert.equal(SIGNATURE_BYTES, 12);
});

test("text, optional container brands and a RIFF file with a different tag remain unknown", () => {
    for (const hex of ["", "6e6f7420616e20696d616765", "000000186674797068656963", "000000186674797061766966",
        "524946460000000057415645", "4e4f50450000000057454250", "0049492a00", "89004e470d0a1a0a"]) {
        assert.equal(unknownFormatCode(Buffer.from(hex, "hex")), "not-an-image", hex);
    }
});
