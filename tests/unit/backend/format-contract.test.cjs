"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { LOADERS, rawMetadata } = require("../../../src/backend/metadata.js");
const { SUPPORTED_FORMATS } = require("../../../src/core/formats.js");
const { sourceIssues } = require("../../../src/core/source-policy.js");

test("backend loader families and core format families cover each other", () => {
    const families = new Set(SUPPORTED_FORMATS.map((format) => format.family));
    assert.deepEqual(new Set(Object.values(LOADERS).map((facts) => facts.format)), families);
    assert.deepEqual(SUPPORTED_FORMATS.map((format) => format.pageEncoding), ["jpeg", "png", "jpeg", "png", "jpeg", "jpeg"]);
});

test("missing content differs from every recognized but excluded loader", () => {
    for (const loader of [""]) {
        const [issue] = sourceIssues(rawMetadata({ "vips-loader": loader }));
        assert.equal(issue.code, "not-an-image");
        assert.equal(issue.diagnostic, undefined);
    }
    for (const loader of ["gifload", "svgload", "pdfload", "pdfiumload", "not-svgload", "unknown"]) {
        const [issue] = sourceIssues(rawMetadata({ "vips-loader": loader }));
        assert.equal(issue.code, "unsupported-content");
        assert.deepEqual(issue.diagnostic, { loader });
    }
});


test("Ultra HDR file and buffer loaders expose JPEG and gain-map facts", () => {
    for (const loader of ["uhdrload", "uhdrload_buffer"]) {
        const facts = rawMetadata({ "vips-loader": loader });
        assert.equal(facts.format, "JPEG");
        assert.equal(facts.gainMap, true);
    }
    assert.equal(rawMetadata({ "vips-loader": "jpegload" }).gainMap, false);
});


test("unmapped content names its loader without contradicting the extension", () => {
    assert.deepEqual(sourceIssues(rawMetadata({ "vips-loader": "gifload" })), [{
        code: "unsupported-content", stage: "inspection",
        message: "This file's content is not a supported still image; use JPEG, PNG, HEIC, TIFF, WebP or AVIF.",
        diagnostic: { loader: "gifload" }
    }]);
});
