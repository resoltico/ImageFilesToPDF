"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { outputNameForCombined, outputNameForSeparate, stagedPdfPath, collisionPath, MAXIMUM_SUFFIX } = require("../../../src/core/naming.js");
const { documentPlan } = require("../../../src/core/document-plan.js");

test("combined names use the validated local timestamp and separate names use sanitized stems", () => {
    assert.equal(outputNameForCombined("20260904_070509"), "Images 2026-09-04 at 07.05.09.pdf");
    assert.equal(outputNameForSeparate({ originalName: "A:B.png" }), "A_B.pdf");
    assert.equal(outputNameForSeparate({ originalName: "holiday.JPEG" }, true), "holiday-jpeg.pdf");
    assert.throws(() => outputNameForCombined("../../elsewhere"), /YYYYMMDD_HHMMSS/u);
});

test("same-run destination conflicts get source extensions, while different destinations do not", () => {
    const source = (originalName, folder = "/out/") => ({ path: `${folder}${originalName}`, originalName, folder });
    const sources = [source("photo.jpg"), source("photo.PNG"), source("photo.jpg", "/other/")];
    assert.deepEqual(documentPlan({ mode: "separate" }, sources, "20260904_070509").map((plan) => plan.destination), ["/out/photo-jpg.pdf", "/out/photo-png.pdf", "/other/photo.pdf"]);
    assert.deepEqual(documentPlan({ mode: "separate" }, [source("photo.JPG"), source("photo.jpg")], "20260904_070509").map((plan) => plan.destination), ["/out/photo-jpg.pdf", "/out/photo-jpg.pdf"]);
    assert.equal(documentPlan({ mode: "combined" }, sources, "20260904_070509")[0].destination, "/out/Images 2026-09-04 at 07.05.09.pdf");
    assert.deepEqual(documentPlan({ mode: "combined" }, [], "unused"), []);
});

test("Finder-style collisions preserve the extension and reject non-PDF candidates", () => {
    assert.equal(collisionPath("/a/file.pdf", 1), "/a/file.pdf");
    assert.equal(collisionPath("/a/file.pdf", 2), "/a/file 2.pdf");
    assert.equal(collisionPath("/a\nfolder/file.PDF", 9999), "/a\nfolder/file 9999.PDF");
    assert.equal(MAXIMUM_SUFFIX, 10000);
    assert.throws(() => collisionPath("/a/file.txt", 2), /Cannot generate/u);
});

test("staged paths remain in their workspace and sanitize tokens", () => {
    assert.equal(stagedPdfPath("/tmp/ws", "abc:123"), "/tmp/ws/staged-abc_123.pdf");
    for (const token of ["../escape", "a/b", "/absolute"]) { assert.equal(stagedPdfPath("/tmp/ws", token).slice("/tmp/ws/".length).includes("/"), false); }
});
