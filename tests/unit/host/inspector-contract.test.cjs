"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { inspectCandidates, inspectCaptured } = require("../../../src/host/source-inspection.js");
const { issuesOf } = require("../../../src/core/outcomes.js");
const { validatePdf } = require("../../../src/host/staging.js");
const { createProgress } = require("../../../src/host/progress.js");
const { createFakeHost } = require("../ports/fake-host.cjs");
const { makeJob } = require("../ports/fake-job.cjs");
const base = "width: 400\nheight: 200\nbands: 3\nvips-loader: jpegload\ninterpretation: srgb\n";

test("captured inspection preserves original identity and authoritative oriented facts", () => {
    for (const [loader, format] of [["jpegload", "JPEG"], ["pngload", "PNG"], ["tiffload", "TIFF"], ["heifload", "HEIF"], ["webpload", "WebP"], ["pngload_buffer", "PNG"]]) {
        const host = createFakeHost();
        Object.assign(host, { loader, width: 900, height: 600, orientation: 6 });
        const result = inspectCaptured(makeJob(host), { path: "/owned", identity: "original", version: "observed" }, "/user.png");
        assert.equal(result.format, format);
        assert.deepEqual([result.width, result.height, result.identity, result.version], [600, 900, "original", "observed"]);
        assert.ok(host.commands.some((command) => command.includes("'-f' 'orientation' '/owned'")));
    }
});

test("unknown loaders and damaged metadata produce domain messages with the user's path", () => {
    for (const loader of ["svgload", "pdfload", "rawload", "unknownload"]) {
        const host = createFakeHost(); host.loader = loader;
        assert.throws(() => inspectCaptured(makeJob(host), { path: "/owned" }, "/user.png"), (error) =>
            error.issues[0].source === "/user.png" && ["not-an-image", "unsupported-content"].includes(error.issues[0].code));
    }
    for (const facts of [{ width: 0 }, { height: 0 }, { bands: 0 }, { orientation: 0 }, { orientation: 9 }]) {
        const host = createFakeHost(); Object.assign(host, facts);
        assert.throws(() => inspectCaptured(makeJob(host), { path: "/owned" }, "/user.png"), (error) => error.issues[0].code === "damaged");
    }
});

test("PNG ImageIO frame count overrides vips and rejects animation", () => {
    const host = createFakeHost(); const job = makeJob(host);
    job.sources.pngCount = (path) => { assert.equal(path, "/owned"); return 2; };
    assert.throws(() => inspectCaptured(job, { path: "/owned" }, "/user.png"), (error) => error.issues[0].code === "multiple-images");
});

test("printable comments cannot forge orientation, frame count or ICC presence", () => {
    const forged = `${base}orientation: 6\nn-pages: 2\nicc-profile-data: 480 bytes of binary data\n`;
    const host = createFakeHost({ failures: [["'-a'", forged], ...["orientation", "n-pages", "icc-profile-data"].map((field) => [`'-f' '${field}'`, new Error(`vips_image_get: field "${field}" not found`)])] });
    const result = inspectCaptured(makeJob(host), { path: "/owned" }, "/user.jpg");
    assert.deepEqual([result.width, result.height, result.orientation, result.pages, result.icc], [400, 200, 1, 1, false]);
});

test("ambiguous dumps use scalar fields and programming faults are not file refusals", () => {
    const host = createFakeHost({ failures: [["'-a'", `${base}width: 999\n`]] });
    host.loader = "jpegload";
    const result = inspectCaptured(makeJob(host), { path: "/owned" }, "/user.jpg");
    assert.deepEqual([result.width, result.height, result.format, result.interpretation], [600, 400, "JPEG", "srgb"]);
    const broken = createFakeHost({ failures: [["'-f' 'orientation'", new TypeError("bridge bug")]] });
    assert.throws(() => inspectCaptured(makeJob(broken), { path: "/owned" }, "/user.png"), (error) => issuesOf(error, "inspection")[0].code === "fault");
});

test("ordinary candidates are inspected in bounded batches before producing admission records", () => {
    const host = createFakeHost({ files: ["/a.png", "/b.png"] });
    const job = makeJob(host);
    const selection = { images: ["/a.png", "/b.png"].map((path) => ({ path, originalName: path.slice(1), folder: "/" })), rejected: [], selectedFolders: 0 };
    const result = inspectCandidates(host, selection, { tools: job.tools, sources: job.sources, progress: createProgress([]) });
    assert.equal(result.images.length, 2);
    assert.equal(result.images[0].admission.identity, "/a.png");
    assert.ok(host.commands.some((command) => command.includes("'-a' '/a.png' '/b.png'")));
    assert.ok(host.commands.every((command) => command.startsWith("LC_ALL=C ")));
});

test("exact final page count is independently required before strict validation", () => {
    for (const count of ["not found", "Page count: 2"]) {
        const host = createFakeHost({ files: ["/stage.pdf"], failures: [["'info'", count]] });
        assert.throws(() => validatePdf(makeJob(host), "/stage.pdf", 1), /page count could not be verified|2 pages where 1/u);
        assert.ok(!host.commands.some((command) => command.includes("'validate'")));
    }
});
