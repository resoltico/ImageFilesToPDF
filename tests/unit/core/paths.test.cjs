"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    SUPPORTED_FORMATS,
    supportedFormatList,
    isSupportedImage,
    basename,
    dirname,
    fileStem,
    sanitizeFilename
} = require("../../../src/core/paths.js");

const NUL = String.fromCharCode(0);
const DEL = String.fromCharCode(127);

test("isSupportedImage accepts the still-image formats vips reads", () => {
    const accepted = [
        "/a/b.jpg", "/a/b.JPG", "/a/b.jpeg", "/a/b.png", "/a/b.PNG",
        "/a/b.heic", "/a/b.HEIF", "/a/b.heif",
        "/a/b.tif", "/a/b.tiff", "/a/b.TIFF",
        "/a/b.webp", "/a/b.avif"
    ];

    for (const path of accepted) {
        assert.equal(isSupportedImage(path), true, path);
    }
});

test("isSupportedImage rejects formats whose semantics would surprise", () => {
    // vips can read all of these. GIF and animated WebP would contribute only
    // their first frame, SVG would land as a stamp because the pipeline never
    // upscales, PDF would rasterise page one of a PDF to build a PDF, and RAW
    // is a processing job rather than a conversion.
    for (const rejected of [
        "/a/b.gif", "/a/b.svg", "/a/b.pdf", "/a/b.cr2", "/a/b.nef",
        "/a/b.bmp", "/a/b", "/a/pngx", "/a/b.png.txt", "/a/b.heicx"
    ]) {
        assert.equal(isSupportedImage(rejected), false, rejected);
    }
});

test("basename and dirname split a POSIX path", () => {
    assert.equal(basename("/a/b/c.png"), "c.png");
    assert.equal(basename("c.png"), "c.png");
    assert.equal(basename("/a/b/"), "b");
    assert.equal(dirname("/a/b/c.png"), "/a/b/");
    assert.equal(dirname("c.png"), "");
});

test("fileStem keeps a leading dot but drops the last extension", () => {
    assert.equal(fileStem(".hidden"), ".hidden");
    assert.equal(fileStem("archive.part.png"), "archive.part");
    assert.equal(fileStem("noextension"), "noextension");
});

test("sanitizeFilename preserves Unicode and strips separators", () => {
    assert.equal(sanitizeFilename("  A:B/C  "), "A_B_C");
    assert.equal(sanitizeFilename("Žalioji byla"), "Žalioji byla");
    assert.equal(sanitizeFilename("/leading"), "leading");
});

test("sanitizeFilename never yields an empty or edge-padded name", () => {
    assert.equal(sanitizeFilename(".."), "image");
    assert.equal(sanitizeFilename(" "), "image");
    assert.equal(sanitizeFilename(""), "image");
    assert.equal(sanitizeFilename(NUL + DEL), "image");
    // A name that begins or ends in whitespace is confusing on disk.
    assert.equal(sanitizeFilename("_ a _"), "a");
});

test("isSupportedImage anchors the extension at the end", () => {
    // Without the anchor, a file merely containing ".png" would be accepted.
    assert.equal(isSupportedImage("/a/report.png.txt"), false);
    assert.equal(isSupportedImage("/a/png.doc"), false);
    assert.equal(isSupportedImage("/a/b.jpeg.zip"), false);
});

test("basename and dirname handle a path at the filesystem root", () => {
    // The separator is at index 0 here, so a `> 0` test would miss it.
    assert.equal(basename("/file.png"), "file.png");
    assert.equal(dirname("/file.png"), "/");
});

test("basename ignores any number of trailing separators", () => {
    assert.equal(basename("/a/b//"), "b");
    assert.equal(basename("/a/b///"), "b");
});

test("sanitizeFilename strips dots at both ends, however many", () => {
    assert.equal(sanitizeFilename("..name.."), "name");
    assert.equal(sanitizeFilename(".name"), "name");
    assert.equal(sanitizeFilename("name."), "name");
    assert.equal(sanitizeFilename("a.b"), "a.b", "an interior dot must survive");
});

test("sanitizeFilename collapses runs of underscores, not single ones", () => {
    assert.equal(sanitizeFilename("a___b"), "a_b");
    assert.equal(sanitizeFilename("a_b"), "a_b");
});

test("the list shown to the user matches what the filter accepts", () => {
    // Both are derived from one table, so a format cannot be advertised and
    // then rejected, or accepted without ever being mentioned.
    const listed = supportedFormatList();

    for (const { name, extensions } of SUPPORTED_FORMATS) {
        assert.ok(listed.includes(name), `${name  } should be listed`);

        for (const extension of extensions) {
            assert.equal(isSupportedImage(`/a/photo.${  extension}`), true, extension);
        }
    }
});

test("the list reads as prose, not as a data dump", () => {
    assert.equal(supportedFormatList(), "JPEG, PNG, HEIC, TIFF, WebP or AVIF");
});
