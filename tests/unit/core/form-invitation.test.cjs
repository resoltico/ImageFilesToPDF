"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { invitation, formSpec, defaultAnswers } = require("../../../src/host/settings-model.js");
test("summary follows grouping and retains complete save locations", () => {
    const context = { count: 2, folders: ["/Pictures/One/", "/Pictures/Two/"] };
    const first = formSpec(defaultAnswers(), [], context);
    assert.equal(first.fullDetail, "2 images → 1 PDF with 2 pages, saved in One/\n\nSave locations:\n/Pictures/One/");
    const second = formSpec({ ...defaultAnswers(), mode: "separate" }, [], context);
    assert.equal(second.fullDetail, "2 images → 2 single-page PDFs, saved in 2 folders\n\nSave locations:\n/Pictures/One/\n/Pictures/Two/");
    assert.equal(first.summaryDetails.separate, second.fullDetail);
});
test("an unknown selection count is not invented", () => { assert.equal(invitation(), "Choose the PDF settings."); });
test("validation does not replace the output preview", () => {
    const spec = formSpec(defaultAnswers(), [{key:"quality",message:"JPEG quality is invalid"}], {count:1});
    assert.equal(spec.detail, "JPEG quality is invalid");
    assert.match(spec.fullDetail, /^1 image → 1 PDF with 1 page/u);
});
