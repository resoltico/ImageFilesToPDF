"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { inspectSource } = require("../../../src/host/source-image.js");
const { validatePdf } = require("../../../src/host/staging.js");
const { createFakeHost } = require("../ports/fake-host.cjs");
const { makeJob } = require("../ports/fake-job.cjs");

test("captured metadata preserves original identity and oriented facts", () => {
    for (const [loader, format] of [["jpegload", "JPEG"], ["pngload", "PNG"], ["tiffload", "TIFF"], ["heifload", "HEIF"], ["webpload", "WebP"], ["pngload_buffer", "PNG"]]) {
        const host = createFakeHost();
        Object.assign(host, { loader, width: 900, height: 600, orientation: 6 });
        const result = inspectSource(makeJob(host), { path: "/owned", identity: "original", version: "observed" });
        assert.equal(result.format, format);
        assert.deepEqual([result.width, result.height, result.identity, result.version], [600, 900, "original", "observed"]);
        assert.equal(host.commands.filter((command) => command.includes("vipsheader")).length, 1);
    }
});

test("unknown loaders and damaged metadata fail closed", () => {
    for (const loader of ["svgload", "pdfload", "rawload", "unknownload"]) {
        const host = createFakeHost(); host.loader = loader;
        assert.throws(() => inspectSource(makeJob(host), { path: "/owned" }), (error) => error.issues[0].code === "source-format");
    }
    for (const facts of [{ width: 0 }, { height: 0 }, { bands: 0 }, { orientation: 0 }, { orientation: 9 }]) {
        const host = createFakeHost(); Object.assign(host, facts);
        assert.throws(() => inspectSource(makeJob(host), { path: "/owned" }), /metadata is damaged/u);
    }
});

test("PNG ImageIO frame count overrides vips and rejects animation", () => {
    const host = createFakeHost(); const job = makeJob(host);
    job.sources.pngCount = (path) => { assert.equal(path, "/owned"); return 2; };
    assert.throws(() => inspectSource(job, { path: "/owned" }), (error) => error.issues[0].code === "source-multiple");
});

test("exact final page count is independently required before strict validation", () => {
    for (const count of ["not found", "Page count: 2"]) {
        const host = createFakeHost({ files: ["/stage.pdf"], failures: [["'info'", count]] });
        assert.throws(() => validatePdf(makeJob(host), "/stage.pdf", 1), /page count could not be verified|2 pages where 1/u);
        assert.ok(!host.commands.some((command) => command.includes("'validate'")));
    }
});
