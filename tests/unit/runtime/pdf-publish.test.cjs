"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createAndValidatePdf } = require("../../../src/runtime/pdf.js");
const { calculatePageGeometry } = require("../../../src/core/geometry.js");
const { createFakeApp } = require("./fake-app.cjs");
const { createFakeHost } = require("./fake-host.cjs");

const geometry = calculatePageGeometry({
    paperSize: "A4",
    orientation: "Portrait",
    dpi: 72,
    quality: 85,
    mode: "Single PDF",
    background: "#FFFFFF"
});

function makeJob(app) {
    return {
        app,
        geometry,
        settings: { quality: 85, background: "#FFFFFF" },
        timestamp: "20260904_010203",
        workspace: "/tmp/ImageFilesToPDF.X",
        tools: { vips: "/v/vips", vipsheader: "/v/vipsheader", pdfcpu: "/v/pdfcpu" }
    };
}

test("createAndValidatePdf imports then validates strictly", () => {
    const app = createFakeApp();

    createAndValidatePdf(makeJob(app), "/a/out.partial.pdf", ["/tmp/1.jpg"]);

    const ordered = app.commands.filter((command) => command.includes("pdfcpu"));

    assert.match(ordered[0], /'import'/u);
    assert.match(ordered[1], /'validate' '--mode=strict'/u);
});

test("a stale partial file is cleared before the PDF is built", () => {
    // Without the pre-clean, pdfcpu could append to a leftover file.
    const host = createFakeHost({ files: ["/a/out.partial.pdf", "/tmp/1.jpg"] });

    createAndValidatePdf(makeJob(host), "/a/out.partial.pdf", ["/tmp/1.jpg"]);

    const [firstCommand] = host.commands;

    assert.match(firstCommand, /'\/bin\/rm'/u);
    assert.match(firstCommand, /out\.partial\.pdf/u);
});
