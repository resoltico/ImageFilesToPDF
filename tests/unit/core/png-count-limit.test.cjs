"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { Buffer } = require("node:buffer");
const { crc32 } = require("node:zlib");
const { countPng } = require("../../../src/core/png-count.js");
const { pngFixtures } = require("../../integration/lib/png-fixtures.cjs");

test("the chunk count limits work even when all preceding chunks are valid", () => {
    const { single } = pngFixtures();
    const prefix = single.subarray(0, -12);
    const end = single.subarray(-12);
    const ancillary = Buffer.from("00000000744558749642c585", "hex");
    const extra = Array.from({ length: 131068 }, () => ancillary);
    const bytes = Buffer.concat([prefix, ...extra, end]);
    const source = { checksum: crc32, read: (offset, size) => bytes.subarray(offset, offset + size) };
    assert.throws(() => countPng(source, bytes.length), /exceeded the chunk limit/u);
});
