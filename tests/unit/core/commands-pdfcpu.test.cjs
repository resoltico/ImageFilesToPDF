"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    buildPdfcpuInfoArgv,
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
            "--conf",
            "disable",
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

test("pdfcpu validation is strict and independent of user configuration", () => {
    assert.deepEqual(buildPdfcpuValidateArgv("pdfcpu", "/tmp/output.pdf"),
        ["pdfcpu", "validate", "--conf", "disable", "--mode=strict", "/tmp/output.pdf"]);
});

test("pdfcpu page counting is independent of user configuration", () => {
    assert.deepEqual(buildPdfcpuInfoArgv("pdfcpu", "/tmp/output.pdf"),
        ["pdfcpu", "info", "--conf", "disable", "/tmp/output.pdf"]);
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
