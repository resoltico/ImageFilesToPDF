"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    buildPdfcpuImportArgv,
    buildPdfcpuValidateArgv
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

test("pdfcpu import describes the page and preserves page order", () => {
    assert.deepEqual(
        buildPdfcpuImportArgv("pdfcpu", "/tmp/output.pdf", ["/tmp/1.jpg", "/tmp/2.jpg"], geometry),
        [
            "pdfcpu",
            "import",
            "--",
            "dim:595.28 841.89, pos:c, sc:1 rel",
            "/tmp/output.pdf",
            "/tmp/1.jpg",
            "/tmp/2.jpg"
        ]
    );
});

test("pdfcpu import requires at least one page", () => {
    assert.throws(
        () => buildPdfcpuImportArgv("pdfcpu", "/tmp/o.pdf", [], geometry),
        /At least one/u
    );
    assert.throws(
        () => buildPdfcpuImportArgv("pdfcpu", "/tmp/o.pdf", null, geometry),
        /At least one/u
    );
});

test("pdfcpu validate uses the only flag form pflag accepts", () => {
    // pflag reads "-mode strict" as the short cluster "-m ode" and then takes
    // "strict" for a filename; "--mode strict" is rejected outright.
    const argv = buildPdfcpuValidateArgv("pdfcpu", "/tmp/output.pdf");

    assert.deepEqual(argv, ["pdfcpu", "validate", "--mode=strict", "/tmp/output.pdf"]);
    assert.ok(!argv.includes("-mode"));
    assert.ok(!argv.includes("strict"));
});
