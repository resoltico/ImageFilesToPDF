"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildThumbnailArgv, buildFlattenArgv, buildDecodeArgv, hasAlphaBand } = require("../../../src/backend/commands.js");
const options = { placement: { widthPixels: 600, heightPixels: 300 }, source: { bands: 3, icc: false }, background: "#8E79E0", quality: 85, intermediate: false };

test("normalization is image-sized, down-only, colour-managed and damage-sensitive", () => {
    assert.deepEqual(buildThumbnailArgv("vips", "input", "image.jpg", options), ["vips", "thumbnail", "input", "image.jpg[keep=none,Q=85,background=142 121 224]", "600", "--height=300", "--size=down", "--fail-on=error", "--export-profile=srgb"]);
    const png = buildThumbnailArgv("vips", "input", "image.png", options);
    assert.equal(png[3], "image.png[keep=none]");
    const intermediate = buildThumbnailArgv("vips", "input", "image.v", { ...options, intermediate: true });
    assert.equal(intermediate[3], "image.v");
    assert.ok(!buildThumbnailArgv("vips", "in", "grey.png", { ...options, source: { bands: 1, icc: false } }).includes("--export-profile=srgb"));
    assert.ok(buildThumbnailArgv("vips", "in", "grey.png", { ...options, source: { bands: 1, icc: true } }).includes("--export-profile=srgb"));
});

test("lossless alpha intermediate is flattened once and metadata is removed at final encode", () => {
    assert.deepEqual(buildFlattenArgv("vips", "input.v", "image.png", "#8E79E0"), ["vips", "flatten", "input.v", "image.png[keep=none]", "--background=142,121,224"]);
    assert.deepEqual(buildDecodeArgv("vips", "input.jpg"), ["vips", "avg", "input.jpg[fail-on=error]"]);
});

test("alpha detection distinguishes opaque CMYK from RGBA and greyscale alpha", () => {
    for (const [bands, alpha] of [[1, false], [2, true], [3, false], [4, true], [5, true]]) { assert.equal(hasAlphaBand(bands), alpha); }
    assert.equal(hasAlphaBand(4, "cmyk"), false);
    assert.equal(hasAlphaBand(5, "cmyk"), true);
});
