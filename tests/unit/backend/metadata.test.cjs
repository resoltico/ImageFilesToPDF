"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { readMetadata, readMetadataBatch, rawMetadata, finishMetadata, optionalValue, scalarValues, fieldAbsent, headerFailureCode } = require("../../../src/backend/metadata.js");
const base = "width: 400\nheight: 200\nbands: 3\nvips-loader: jpegload\ninterpretation: srgb\n";
const expected = { loader: "jpegload", format: "JPEG", width: 400, height: 200, bands: 3, orientation: 1, pages: 1, icc: false, interpretation: "srgb" };

function header(path, fields = base) {
    return `${path}: 400x200 uchar, 3 bands, srgb, jpegload\n${fields.split("\n").filter(Boolean).map((line) => `${path}: ${line}`).join("\n")}\n`;
}

test("metadata parsing accepts shell CR, CRLF and LF records", () => {
    for (const eol of ["\n", "\r", "\r\n"]) {
        assert.deepEqual(readMetadata(base.replace(/\n/gu, eol)), { raw: expected, optional: [] });
    }
    assert.deepEqual(rawMetadata({ width: "400", height: "200", bands: "3", "vips-loader": "jpegload", interpretation: "srgb" }), expected);
});

test("all EXIF orientations preserve or exchange the physical sides only after confirmation", () => {
    for (const orientation of [1, 2, 3, 4, 5, 6, 7, 8]) {
        const parsed = readMetadata(`${base}orientation: ${orientation}\n`);
        assert.deepEqual([parsed.raw.width, parsed.raw.height], [400, 200]);
        const result = finishMetadata(parsed.raw);
        assert.deepEqual([result.width, result.height], orientation < 5 ? [400, 200] : [200, 400]);
        assert.equal(result.orientation, orientation);
        assert.deepEqual(parsed.optional, ["orientation"]);
    }
});

test("known loaders, counts and ICC are explicit facts", () => {
    for (const [loader, format] of [["pngload", "PNG"], ["tiffload", "TIFF"], ["heifload", "HEIF"], ["webpload", "WebP"], ["pngload_buffer", "PNG"]]) {
        const parsed = readMetadata(`${base.replace("jpegload", loader)}n-pages: 2\nicc-profile-data: 480 bytes of binary data\n`);
        assert.equal(parsed.raw.format, format);
        assert.equal(parsed.raw.pages, 2);
        assert.equal(parsed.raw.icc, true);
        assert.deepEqual(parsed.optional, ["n-pages", "icc-profile-data"]);
    }
    const { raw: absent } = readMetadata("");
    assert.deepEqual([absent.width, absent.height, absent.bands, absent.loader, absent.interpretation], [0, 0, 0, "", ""]);
    assert.equal(absent.format, undefined);
    for (const invalid of ["0", "-1", "4bad", "4.5", "1e3", "9007199254740992"]) {
        const { raw } = readMetadata(`width: ${invalid}\nheight: ${invalid}\nbands: ${invalid}\nn-pages: ${invalid}\norientation: ${invalid}\n`);
        assert.deepEqual([raw.width, raw.height, raw.bands, raw.pages, raw.orientation], [0, 0, 0, 0, 0]);
    }
});

test("complete raw filenames are removed before inspecting isolated responses", () => {
    const path = "/a/path:\nvips-loader: fake.png";
    const text = `${path}: 400x200 uchar, 3 bands, srgb, jpegload\nwidth: 400\nheight: 200\nbands: 3\nfilename: ${path}\nvips-loader: jpegload\ninterpretation: srgb\n`;
    assert.deepEqual(readMetadata(text, path), { raw: expected, optional: [] });
    assert.equal(readMetadata(`${path}: no further header`, path).raw.width, 0);
    assert.throws(() => readMetadata(`${base}width: 99\n`), (error) => error.issues[0].code === "damaged" && error.message === "Duplicate image metadata field: width");
    assert.equal(readMetadata(`ignored: comment\n${base}`).raw.width, 400);
});

test("batch parsing preserves argv order and rejects incomplete or ambiguous blocks", () => {
    const paths = ["/a one.png", "/b: two.jpg"];
    assert.deepEqual(readMetadataBatch(`${header(paths[0])}${header(paths[1])}`, paths), [{ raw: expected, optional: [] }, { raw: expected, optional: [] }]);
    assert.deepEqual(readMetadataBatch("", []), []);
    assert.throws(() => readMetadataBatch(header(paths[1]), paths), /out of order/u);
    assert.throws(() => readMetadataBatch(header(paths[0]), paths), /incomplete/u);
    assert.throws(() => readMetadataBatch(`${header(paths[0])}${header(paths[0])}`, paths), /ambiguous/u);
    const withOptional = readMetadataBatch(header(paths[0], `${base}orientation: 6\nn-pages: 2\nicc-profile-data: 480 bytes\n`), [paths[0]]);
    assert.deepEqual(withOptional[0].optional, ["orientation", "n-pages", "icc-profile-data"]);
    assert.equal(withOptional[0].raw.orientation, 6);
});

test("direct optional-field responses override printable-dump claims and restore absent defaults", () => {
    const raw = { ...expected, orientation: 6, pages: 99, icc: true };
    assert.equal(optionalValue(raw, "orientation", undefined).orientation, 1);
    assert.equal(optionalValue(raw, "orientation", "8\r").orientation, 8);
    assert.equal(optionalValue(raw, "n-pages", undefined).pages, 1);
    assert.equal(optionalValue(raw, "n-pages", "2").pages, 2);
    assert.equal(optionalValue(raw, "icc-profile-data", undefined).icc, false);
    assert.equal(optionalValue(raw, "icc-profile-data", "cHJvZmlsZQ==").icc, true);
    assert.throws(() => optionalValue(raw, "typo", "1"), /Unknown optional/u);
    assert.deepEqual(scalarValues("1\r\n 2 \r\n", 2), ["1", "2"]);
    assert.throws(() => scalarValues("1\n", 2), /incomplete/u);
    assert.throws(() => scalarValues("1\n \n2", 3), /ambiguous/u);
});

test("only the actual absent-field diagnostic establishes an optional default", () => {
    assert.equal(fieldAbsent('vips_image_get: field "orientation" not found', "orientation"), true);
    assert.equal(fieldAbsent('Command failed.\r\rvipsheader: vips_image_get: field "n-pages" not found\r', "n-pages"), true);
    assert.equal(fieldAbsent('vips_image_get: field "width" not found', "orientation"), false);
    assert.equal(fieldAbsent('path has field "orientation" not found in its name', "orientation"), false);
    assert.equal(headerFailureCode("vipsheader: VipsJpeg: truncated header"), "damaged");
    assert.equal(headerFailureCode("Command failed.\r\rvipsheader: VipsPng: broken"), "damaged");
    assert.equal(headerFailureCode("vipsheader: VipsForeignLoad: unknown format"), "not-an-image");
    assert.equal(headerFailureCode("vipsheader: glib: PDF document is damaged"), "not-an-image");
});

test("scalar enum responses normalize to the same interpretation facts as printable dumps", () => {
    for (const [serialized, interpretation] of [["((VipsInterpretation) VIPS_INTERPRETATION_sRGB)", "srgb"], ["((VipsInterpretation) VIPS_INTERPRETATION_B_W)", "b-w"], ["((VipsInterpretation) VIPS_INTERPRETATION_CMYK)", "cmyk"], ["srgb", "srgb"]]) {
        assert.equal(rawMetadata({ interpretation: serialized }).interpretation, interpretation);
    }
    assert.equal(rawMetadata({ interpretation: "prefix ((VipsInterpretation) VIPS_INTERPRETATION_sRGB)" }).interpretation, "prefix ((VipsInterpretation) VIPS_INTERPRETATION_sRGB)");
});

test("field spacing is normalized without accepting keys inside unrelated text", () => {
    const result = readMetadata("width:400\nheight:\t200 \nbands: 3\nvips-loader:\t jpegload \t\ninterpretation: srgb \t\n");
    assert.deepEqual(result.raw, expected);
    assert.equal(readMetadata("xwidth: 400\nheight: 200\nbands: 3\n").raw.width, 0);
    assert.equal(readMetadata(base.replace("jpegload", "_bufferjpegload")).raw.format, undefined);
    assert.equal(fieldAbsent('  vips_image_get: field "orientation" not found \t', "orientation"), true);
    assert.equal(headerFailureCode("VipsJpeg: truncated header"), "damaged");
    assert.equal(headerFailureCode("vipsheader:\t \tVipsPng: broken"), "damaged");
});

test("unprefixed continuation text cannot become a batch fact", () => {
    const text = `${header("/a.png")}ignored:orientation: 6\n`;
    assert.deepEqual(readMetadataBatch(text, ["/a.png"]), [{ raw: expected, optional: [] }]);
});

test("enum and absence parsing trim framing but reject trailing interpretation data", () => {
    assert.equal(rawMetadata({ interpretation: " \t((VipsInterpretation) VIPS_INTERPRETATION_sRGB) \r\n" }).interpretation, "srgb");
    const invalid = "((VipsInterpretation) VIPS_INTERPRETATION_sRGB) trailing";
    assert.equal(rawMetadata({ interpretation: invalid }).interpretation, invalid);
    assert.equal(fieldAbsent(' \tvipsheader: vips_image_get: field "n-pages" not found  ', "n-pages"), true);
});
