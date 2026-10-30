"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { mergeGroups } = require("../../../src/backend/merging.js");
const { buildPdfcpuMergeArgv } = require("../../../src/backend/pdfcpu.js");

test("merge disables bookmarks and external configuration", () => {
    assert.deepEqual(buildPdfcpuMergeArgv("pdfcpu", "/out.pdf", ["/1.pdf", "/2.pdf"]), ["pdfcpu", "merge", "--conf", "disable", "--bookmarks=false", "--", "/out.pdf", "/1.pdf", "/2.pdf"]);
});

test("merge levels preserve order within bounded groups", () => {
    const paths = Array.from({ length: 65 }, (ignored, index) => `/${index}.pdf`);
    const groups = mergeGroups("pdfcpu", "/out.pdf", paths);
    assert.deepEqual(groups.map((group) => group.length), [32, 32, 1]);
    assert.deepEqual(groups.flat(), paths);
    assert.deepEqual(mergeGroups("pdfcpu", "/out.pdf", []), []);
});

test("argv byte budget is enforced independently of the page bound", () => {
    assert.throws(() => mergeGroups("pdfcpu", "/out.pdf", ["/a.pdf"], 1), /argument exceeds/u);
    const groups = mergeGroups("pdfcpu", "/out.pdf", ["/a.pdf", "/b.pdf"], 81);
    assert.deepEqual(groups, [["/a.pdf"], ["/b.pdf"]]);
});
