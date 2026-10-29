"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    outputNameForCombined,
    outputNameForSeparate,
    stagedPdfPath
} = require("../../../src/core/naming.js");
const { makeTimestamp } = require("../../../src/core/timestamps.js");

test("makeTimestamp is fixed width and sorts chronologically", () => {
    assert.equal(makeTimestamp(new Date(2026, 8, 4, 7, 5, 9)), "20260904_070509");
    assert.equal(makeTimestamp(new Date(2026, 11, 31, 23, 59, 59)), "20261231_235959");
    assert.equal(makeTimestamp(new Date(2026, 0, 1, 0, 0, 0)), "20260101_000000");
});

test("an output name is one path component, whatever it is handed", () => {
    // The stem has always been sanitized and the timestamp never was, so a
    // headless caller's "2026/09/12" put a separator inside a filename and
    // the PDF went somewhere other than the folder it was promised. Read at
    // the boundary as well; this is the invariant that holds regardless.
    const escaping = "/../../elsewhere/result";
    const combined = outputNameForCombined(escaping);
    const separate = outputNameForSeparate({ originalName: "a.png" }, escaping);

    // A separator is what would move the file. Dots left inside the name are
    // an odd filename in the right folder, which is not the same thing.
    for (const name of [combined, separate]) {
        assert.ok(!name.includes("/"), name);
        assert.ok(name.endsWith(".pdf"), name);
    }

    assert.equal(combined, "output_.._.._elsewhere_result.pdf");
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





test("publication collision candidates preserve the full name and bound suffix vocabulary",()=>{
    const {collisionPath,MAXIMUM_SUFFIX}=require("../../../src/core/naming.js");
    assert.equal(collisionPath("/a/file.pdf",1),"/a/file.pdf");
    assert.equal(collisionPath("/a/file.pdf",2),"/a/file_2.pdf");
    assert.equal(collisionPath("/a\nfolder/file.PDF",9999),"/a\nfolder/file_9999.PDF");
    assert.equal(MAXIMUM_SUFFIX,10000);assert.throws(()=>collisionPath("/a/notes.txt",2),/Cannot generate/u);
});
