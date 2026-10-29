"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { readMetadata, metadataField } = require("../../../src/backend/metadata.js");
const base = "width: 400\nheight: 200\nbands: 3\nvips-loader: jpegload\ninterpretation: srgb\n";

test("metadata parsing accepts shell CR, CRLF and LF records", () => {
    for (const eol of ["\n", "\r", "\r\n"]) {
        assert.deepEqual(readMetadata(base.replace(/\n/gu, eol)), { width: 400, height: 200, bands: 3, loader: "jpegload", format: "JPEG", interpretation: "srgb", icc: false, pages: 1, orientation: 1 });
    }
});

test("all EXIF orientations preserve or exchange the physical sides", () => {
    for (const orientation of [1, 2, 3, 4, 5, 6, 7, 8]) {
        const result = readMetadata(`${base}orientation: ${orientation}\n`);
        assert.deepEqual([result.width, result.height], orientation < 5 ? [400, 200] : [200, 400]);
        assert.equal(result.orientation, orientation);
    }
});

test("known loaders, counts and ICC are explicit facts", () => {
    for (const [loader, format] of [["pngload", "PNG"], ["tiffload", "TIFF"], ["heifload", "HEIF"], ["webpload", "WebP"], ["pngload_buffer", "PNG"]]) {
        const result = readMetadata(`${base.replace("jpegload", loader)}n-pages: 2\nicc-profile-data: 480 bytes of binary data\n`);
        assert.equal(result.format, format);
        assert.equal(result.pages, 2);
        assert.equal(result.icc, true);
    }
    const absent = readMetadata("");
    assert.deepEqual([absent.width, absent.height, absent.bands, absent.loader, absent.interpretation], [0, 0, 0, "", ""]);
    assert.equal(absent.format, undefined);
    for (const invalid of ["0", "-1", "4bad", "4.5", "1e3", "9007199254740992"]) {
        const result = readMetadata(`width: ${invalid}\nheight: ${invalid}\nbands: ${invalid}\nn-pages: ${invalid}\norientation: ${invalid}\n`);
        assert.deepEqual([result.width, result.height, result.bands, result.pages, result.orientation], [0, 0, 0, 0, 0]);
    }
});

test("batch fields use the complete original path, including punctuation and newlines", () => {
    const path = "/a/path:\nwith spaces.png";
    const text = base.split("\n").filter(Boolean).map((line) => `${path}: ${line}`).join("\n");
    assert.equal(metadataField(text, "width", path), "400");
    assert.equal(readMetadata(text, path).height, 200);
    assert.equal(metadataField(text, "unknown", path), null);
});
