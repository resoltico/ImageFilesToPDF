"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    buildThumbnailArgv,
    buildFlattenArgv,
    buildGravityArgv,
    hasAlphaBand
} = require("../../../src/core/commands.js");
const { calculatePageGeometry } = require("../../../src/core/geometry.js");

const geometry = calculatePageGeometry({
    paperSize: "A4",
    orientation: "Portrait",
    dpi: 300,
    quality: 92,
    mode: "Single PDF",
    background: "#FFFFFF"
});

test("the thumbnail stage is ICC aware and never upscales", () => {
    const argv = buildThumbnailArgv(
        "/opt/homebrew/bin/vips",
        "/tmp/in file.png",
        "/tmp/stage.v",
        geometry
    );

    assert.deepEqual(argv, [
        "/opt/homebrew/bin/vips",
        "thumbnail",
        "/tmp/in file.png",
        "/tmp/stage.v",
        "2480",
        "--height=3508",
        "--size=down",
        "--export-profile=srgb"
    ]);
});

test("the thumbnail stage carries both regression guards", () => {
    const argv = buildThumbnailArgv("vips", "a.png", "b.v", geometry);

    // Without --export-profile, embedded ICC profiles are ignored and
    // Display P3 or Adobe RGB sources shift colour.
    assert.ok(argv.includes("--export-profile=srgb"));
    // With --size=both, an image smaller than the page is upscaled to fill it.
    assert.ok(!argv.includes("--size=both"));
    assert.ok(argv.includes("--size=down"));
});

test("flatten composites onto the chosen background", () => {
    assert.deepEqual(buildFlattenArgv("vips", "a.v", "b.v", "#8E79E0"), [
        "vips",
        "flatten",
        "a.v",
        "b.v",
        "--background=142,121,224"
    ]);
    assert.deepEqual(buildFlattenArgv("vips", "a.v", "b.v", "#FFFFFF"), [
        "vips",
        "flatten",
        "a.v",
        "b.v",
        "--background=255"
    ]);
});

test("gravity centres on the page and strips metadata", () => {
    assert.deepEqual(
        buildGravityArgv("vips", "a.v", "/tmp/page.jpg", {
            geometry,
            quality: 92,
            background: "#FFFFFF"
        }),
        [
            "vips",
            "gravity",
            "a.v",
            "/tmp/page.jpg[Q=92,keep=none]",
            "centre",
            "2480",
            "3508",
            "--extend=background",
            "--background=255"
        ]
    );
});

test("gravity validates the quality it is given", () => {
    assert.throws(
        () => buildGravityArgv("vips", "a.v", "p.jpg", {
            geometry,
            quality: 0,
            background: "#FFFFFF"
        }),
        /Quality must be/u
    );
    assert.throws(
        () => buildGravityArgv("vips", "a.v", "p.jpg", {
            geometry,
            quality: 101,
            background: "#FFFFFF"
        }),
        /Quality must be/u
    );
});

test("hasAlphaBand reads the decoded image, not the extension", () => {
    assert.equal(hasAlphaBand(2), true, "grey + alpha");
    assert.equal(hasAlphaBand(4), true, "RGB + alpha");
    assert.equal(hasAlphaBand(5), true, "extra bands");
    assert.equal(hasAlphaBand(1), false, "grey");
    assert.equal(hasAlphaBand(3), false, "RGB");
    assert.equal(hasAlphaBand("4"), true, "vipsheader returns text");
});
