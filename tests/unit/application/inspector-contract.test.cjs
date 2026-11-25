"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { inspectCandidates, inspectCaptured } = require("../../../src/application/source-inspection.js");
const { issuesOf } = require("../../../src/core/outcomes.js");
const { validatePdf } = require("../../../src/application/staging.js");
const { createProgress } = require("../../../src/application/progress.js");
const { createConversionFixture } = require("../ports/fake-conversion.cjs");
const { makeJob } = require("../ports/fake-job.cjs");
const base = "width: 400\nheight: 200\nbands: 3\nvips-loader: jpegload\ninterpretation: srgb\n";

test("captured inspection preserves original identity and authoritative oriented facts", async () => {
    for (const [loader, format] of [["jpegload", "JPEG"], ["pngload", "PNG"], ["tiffload", "TIFF"], ["heifload", "HEIF"], ["webpload", "WebP"], ["pngload_buffer", "PNG"]]) {
        const host = createConversionFixture();
        Object.assign(host, { loader, width: 900, height: 600, orientation: 6 });
        const result = (await inspectCaptured(makeJob(host), { path: "/owned", identity: "original", version: "observed", prefix: [0xff] }, "/user.png"));
        assert.equal(result.format, format);
        assert.deepEqual([result.width, result.height, result.identity, result.version], [600, 900, "original", "observed"]);
        assert.equal(Object.hasOwn(result, "prefix"), false);
        assert.ok(host.commands.some((command) => command.slice(1).join(" ") === "-f orientation /owned"));
    }
});

test("unknown loaders and damaged metadata produce domain messages with the user's path", async () => {
    for (const loader of ["svgload", "pdfload", "rawload", "unknownload"]) {
        const host = createConversionFixture(); host.loader = loader;
        await assert.rejects(() => inspectCaptured(makeJob(host), { path: "/owned" }, "/user.png"), (error) =>
            error.issues[0].source === "/user.png" && error.issues[0].code === "unsupported-content" && error.issues[0].diagnostic.loader === loader);
    }
    for (const facts of [{ width: 0 }, { height: 0 }, { bands: 0 }, { orientation: 0 }, { orientation: 9 }]) {
        const host = createConversionFixture(); Object.assign(host, facts);
        await assert.rejects(() => inspectCaptured(makeJob(host), { path: "/owned" }, "/user.png"), (error) => error.issues[0].code === "damaged");
    }
});

test("PNG ImageIO frame count overrides vips and rejects animation", async () => {
    const host = createConversionFixture(); const job = makeJob(host);
    job.sources.pngCount = (path) => { assert.equal(path, "/owned"); return 2; };
    await assert.rejects(() => inspectCaptured(job, { path: "/owned" }, "/user.png"), (error) => error.issues[0].code === "multiple-images");
});

test("printable comments cannot forge orientation, frame count or ICC presence", async () => {
    const forged = `${base}orientation: 6\nn-pages: 2\nicc-profile-data: 480 bytes of binary data\n`;
    const host = createConversionFixture({ faults: { run([,operation, field]) {
        if (operation === "-a") { return forged; }
        if (["orientation", "n-pages", "icc-profile-data"].includes(field)) { throw new Error(`vips_image_get: field "${field}" not found`); }
        return undefined;
    } } });
    const result = (await inspectCaptured(makeJob(host), { path: "/owned" }, "/user.jpg"));
    assert.deepEqual([result.width, result.height, result.orientation, result.pages, result.icc], [400, 200, 1, 1, false]);
});

test("ambiguous dumps use scalar fields and programming faults are not file refusals", async () => {
    const host = createConversionFixture({ faults: { run: ([, operation]) => operation === "-a" ? `${base}width: 999\n` : undefined } });
    host.loader = "jpegload";
    const result = (await inspectCaptured(makeJob(host), { path: "/owned" }, "/user.jpg"));
    assert.deepEqual([result.width, result.height, result.format, result.interpretation], [600, 400, "JPEG", "srgb"]);
    const broken = createConversionFixture({ faults: { run: ([, operation, field]) => operation === "-f" && field === "orientation" ? new TypeError("bridge bug") : undefined } });
    await assert.rejects(() => inspectCaptured(makeJob(broken), { path: "/owned" }, "/user.png"), (error) => issuesOf(error, "inspection")[0].code === "fault");
});

test("ordinary candidates are inspected in bounded batches before producing admission records", async () => {
    const host = createConversionFixture({ files: ["/a.png", "/b.png"] });
    const job = makeJob(host);
    const selection = { images: ["/a.png", "/b.png"].map((path) => ({ path, originalName: path.slice(1), folder: "/" })), rejected: [], selectedFolders: 0 };
    const result = (await inspectCandidates(host.operations, selection, { tools: job.tools, sources: job.sources, progress: createProgress([]) }));
    assert.equal(result.images.length, 2);
    assert.equal(result.images[0].admission.identity, "/a.png");
    assert.ok(host.commands.some((command) => command.slice(1).join(" ") === "-a /a.png /b.png"));
});

test("exact final page count is independently required before strict validation", async () => {
    for (const count of ["not found", "Page count: 2"]) {
        const host = createConversionFixture({ files: ["/stage.pdf"], faults: { run: ([, operation]) => operation === "info" ? count : undefined } });
        await assert.rejects(() => validatePdf(makeJob(host), "/stage.pdf", 1), /page count could not be verified|2 pages where 1/u);
        assert.ok(!host.commands.some((command) => command.includes("validate")));
    }
});
