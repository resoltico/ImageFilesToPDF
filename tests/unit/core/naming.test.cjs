"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    makeTimestamp,
    outputNameForCombined,
    outputNameForSeparate,
    nextUniquePath,
    stagedPdfPath
} = require("../../../src/core/naming.js");

test("makeTimestamp is fixed width and sorts chronologically", () => {
    assert.equal(makeTimestamp(new Date(2026, 8, 4, 7, 5, 9)), "20260904_070509");
    assert.equal(makeTimestamp(new Date(2026, 11, 31, 23, 59, 59)), "20261231_235959");
    assert.equal(makeTimestamp(new Date(2026, 0, 1, 0, 0, 0)), "20260101_000000");
});

test("output names are derived from the mode", () => {
    assert.equal(outputNameForCombined("20260904_070509"), "output_20260904_070509.pdf");
    assert.equal(
        outputNameForSeparate({ originalName: "A:B.png" }, "20260904_070509"),
        "A_B_20260904_070509.pdf"
    );
    assert.equal(
        outputNameForSeparate({ originalName: "holiday.jpeg" }, "T"),
        "holiday_T.pdf"
    );
});

test("nextUniquePath returns the path when it is free", () => {
    assert.equal(nextUniquePath("/tmp/b.pdf", () => false), "/tmp/b.pdf");
});

test("nextUniquePath starts suffixing at 2", () => {
    // With only the original occupied, the first candidate must be _2. A
    // sequence starting at 3 would still satisfy the two-occupied case below,
    // so this is the assertion that pins the starting point.
    const occupied = new Set(["/tmp/a.pdf"]);

    assert.equal(
        nextUniquePath("/tmp/a.pdf", (candidate) => occupied.has(candidate)),
        "/tmp/a_2.pdf"
    );
});

test("nextUniquePath suffixes past every occupied candidate", () => {
    const occupied = new Set(["/tmp/a.pdf", "/tmp/a_2.pdf"]);

    assert.equal(
        nextUniquePath("/tmp/a.pdf", (candidate) => occupied.has(candidate)),
        "/tmp/a_3.pdf"
    );
});

test("nextUniquePath refuses paths it cannot suffix or exhausts", () => {
    assert.throws(() => nextUniquePath("/tmp/a.txt", () => true), /Cannot generate/u);
    assert.throws(() => nextUniquePath("/tmp/a.pdf", () => true), /Could not create/u);
});

test("stagedPdfPath stays inside the workspace and sanitizes its token", () => {
    // Never beside the images: a file pdfcpu writes into the output folder
    // turned out to be one the Shortcuts helper could not touch afterwards.
    assert.equal(
        stagedPdfPath("/tmp/ImageFilesToPDF.X", "abc:123"),
        "/tmp/ImageFilesToPDF.X/staged-abc_123.pdf"
    );
    assert.match(stagedPdfPath("/tmp/ws", "x"), /^\/tmp\/ws\//u);
});

test("a staged name cannot escape the workspace", () => {
    // The token becomes part of a filename, so a separator in it would place
    // the PDF somewhere else entirely.
    for (const token of ["../escape", "a/b", "/absolute"]) {
        const staged = stagedPdfPath("/tmp/ws", token);

        assert.equal(
            staged.slice("/tmp/ws/".length).includes("/"),
            false,
            `${token} produced ${staged}`
        );
    }
});

test("the .pdf suffix must be at the very end", () => {
    // Unanchored, a path merely containing ".pdf" would be accepted and the
    // uniquified name would be built around the wrong suffix.
    assert.throws(
        () => nextUniquePath("/tmp/a.pdf.bak", () => true),
        /Cannot generate/u
    );
});

test("the unique-path search is bounded", () => {
    let probed = 0;

    assert.throws(() => nextUniquePath("/tmp/a.pdf", () => {
        probed += 1;

        return true;
    }), /Could not create/u);
    // Bounded, and the bound is not off by one: 2..9999 inclusive plus the
    // original path.
    assert.equal(probed, 9999);
});
