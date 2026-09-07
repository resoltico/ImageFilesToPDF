"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    readPageCountFrom,
    buildPdfcpuImportArgv,
    buildPdfcpuValidateArgv
} = require("../../../src/core/pdfcpu.js");
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

test("a PDF that reports no page count reads as none", () => {
    // The count is asked for only to catch an import that appended nothing,
    // so output that does not carry one must not read as a number of pages.
    assert.equal(readPageCountFrom("          Page count: 4\n"), 4);
    assert.equal(readPageCountFrom("Page count: 4000"), 4000);
    // pdfcpu pads the label; a version that stopped would still be read.
    assert.equal(readPageCountFrom("Page count:4"), 4);
    assert.equal(readPageCountFrom("pdfcpu: no such file\n"), 0);
    assert.equal(readPageCountFrom(""), 0);
});
