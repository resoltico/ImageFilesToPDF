"use strict";
const { Buffer } = require("node:buffer");
const process = require("node:process");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync, execFileSync } = require("node:child_process");
const [script, work] = process.argv.slice(2);
const at = (name) => path.join(work, name);
const native = (tool, args) => execFileSync(tool, args, { encoding: "utf8" }).trim();

function convert(mode, name, status = 0) {
    const configuration = { mode, paperSize: "A4", orientation: "Portrait", resolutionLimit: 300, quality: 92, background: "#FFFFFF", timestamp: "20261113_010203" };
    fs.writeFileSync(at("settings.json"), JSON.stringify(configuration));
    const result = spawnSync("osascript", ["-l", "JavaScript", script, "--", "--headless", at("settings.json"), at(name)], { encoding: "utf8", timeout: 60000 });
    assert.ifError(result.error);
    assert.equal(result.status, status, `${result.stdout}\n${result.stderr}`);
    return JSON.parse(result.stdout);
}

function embedded(document, label) {
    native("pdfcpu", ["validate", "--conf", "disable", "--mode", "strict", document.output]);
    const directory = at(label);
    fs.mkdirSync(directory);
    native("pdfcpu", ["extract", "--conf", "disable", "--mode", "image", document.output, directory]);
    const images = fs.readdirSync(directory).filter((name) => /\.jpe?g$/iu.test(name));
    assert.equal(images.length, 1, "exactly one JPEG page stream");
    const image = path.join(directory, images[0]);
    const metadata = native("vipsheader", ["-a", image]);
    assert.equal(native("vipsheader", ["-f", "vips-loader", image]), "jpegload");
    assert.doesNotMatch(metadata, /gainmap-|icc-profile-data|orientation:/u);
    assert.equal(fs.readFileSync(image).includes(Buffer.from("MPF\0")), false);
    return image;
}

for (const mode of ["combined", "separate"]) {
    for (const name of ["photo", "no-icc", "p3", "rotated-6", "rotated-8"]) {
        const source = at(`${name}.jpg`);
        const original = fs.readFileSync(source);
        const result = convert(mode, `${name}.jpg`);
        assert.equal(result.state, "complete");
        assert.equal(result.documents.length, 1);
        const image = embedded(result.documents[0], `${mode}-${name}`);
        assert.notDeepEqual(fs.readFileSync(image), original, "HDR is always normalized");
        const rotated = name.startsWith("rotated");
        assert.equal(native("vipsheader", ["-f", "width", image]), rotated ? "48" : "64");
        assert.equal(native("vipsheader", ["-f", "height", image]), rotated ? "64" : "48");
        if (name === "p3" || rotated) {
            const expected = native("vips", ["getpoint", at("reference.v"), "8", "8"]).split(/\s+/u).map(Number);
            const points = { p3: ["8", "8"], "rotated-6": ["39", "8"], "rotated-8": ["8", "55"] };
            const point = points[name];
            const actual = native("vips", ["getpoint", image, ...point]).split(/\s+/u).map(Number);
            actual.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) <= 4, `sRGB/orientation channel ${index}: ${value} versus ${expected[index]}`));
        }
        assert.deepEqual(fs.readFileSync(source), original, "source bytes preserved");
    }
    const unsupported = convert(mode, "unmapped.png", 1);
    assert.equal(unsupported.rejected[0].code, "unsupported-content");
    assert.deepEqual(unsupported.rejected[0].diagnostic, { loader: "gifload" });
    assert.equal(unsupported.rejected[0].reason, "This file's content is not a supported still image; use JPEG, PNG, HEIC, TIFF, WebP or AVIF.");
    const damaged = convert(mode, "damaged.jpg", 1);
    assert.equal(damaged.rejected[0].code, "damaged");
    assert.equal(damaged.documents.length, 0);
}
process.stdout.write("Ultra HDR admission, plain SDR JPEG streams, ICC, rotation and damage passed.\n");
