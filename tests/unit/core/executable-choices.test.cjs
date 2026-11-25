"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { chosenExecutableIssue, executableChoices, setupToolProblem, setupFailure } = require("../../../src/core/setup.js");

test("only eligible setup problems offer each known executable once", () => {
    const problems = [
        setupToolProblem("tool-unusable", "pdfcpu", { path: "/old tool" }),
        setupToolProblem("tool-missing", "vips"),
        { code: "runtime-unavailable", params: {} },
        chosenExecutableIssue("node", "/gone"),
        { code: "fault", params: {} },
        { code: "tool-unusable", params: { name: "unknown" } }
    ];
    assert.deepEqual(executableChoices({ state: "setup-failed", issues: problems }), ["node", "vips", "pdfcpu"]);
    assert.deepEqual(executableChoices({ state: "incomplete", issues: problems }), []);
    assert.deepEqual(executableChoices({ state: "setup-failed", issues: [problems[4]] }), []);
});

test("an unusable chosen tool is reported by path and does not get an automatic installation hint", () => {
    for (const code of ["override-invalid", "tool-unusable"]) {
        const result = setupToolProblem(code, "vipsheader", { path: "local tool" });
        assert.deepEqual(result.params, { name: "vipsheader", path: "local tool" });
        assert.equal(result.code, "chosen-executable-invalid");
        assert.match(result.message, /chosen location local tool.*vipsheader/u);
        assert.deepEqual(setupFailure([result], "darwin").issues, [result]);
    }
});

test("each eligible problem offers its own executable, and nothing else does", () => {
    const offer = (issue) => executableChoices({ state: "setup-failed", issues: [issue] });
    assert.deepEqual(offer({ code: "runtime-unavailable", params: {} }), ["node"]);
    assert.deepEqual(offer(chosenExecutableIssue("vips", "/gone")), ["vips"]);
    assert.deepEqual(offer(setupToolProblem("tool-missing", "pdfcpu")), ["pdfcpu"]);
    assert.deepEqual(offer(setupToolProblem("tool-unusable", "vipsheader")), ["vipsheader"]);
    assert.deepEqual(offer(setupToolProblem("override-invalid", "vips", { variable: "IMAGE_FILES_TO_PDF_VIPS", value: "x" })), []);
    assert.deepEqual(offer({ code: "install-hint", params: { name: "vips" } }), []);
});

test("each setup problem carries its own wording and only pdfcpu names a minimum", () => {
    const override = { variable: "IMAGE_FILES_TO_PDF_VIPS", value: "rel/vips" };
    const cases = [
        [setupToolProblem("override-invalid", "vips", override), "override-invalid",
            { variable: "IMAGE_FILES_TO_PDF_VIPS", value: "rel/vips", name: "vips" }, "IMAGE_FILES_TO_PDF_VIPS=\"rel/vips\" is not an absolute regular executable file."],
        [setupToolProblem("tool-unusable", "vips", override), "tool-unusable",
            { variable: "IMAGE_FILES_TO_PDF_VIPS", value: "rel/vips", name: "vips" }, "IMAGE_FILES_TO_PDF_VIPS=\"rel/vips\" failed the vips capability check."],
        [setupToolProblem("tool-unusable", "pdfcpu", override), "tool-unusable",
            { variable: "IMAGE_FILES_TO_PDF_VIPS", value: "rel/vips", name: "pdfcpu", minimum: "0.16.4" },
            "IMAGE_FILES_TO_PDF_VIPS=\"rel/vips\" failed the pdfcpu capability check. Version 0.16.4 or later is required."],
        [setupToolProblem("tool-unusable", "vips"), "tool-unusable", { name: "vips" }, "vips failed its capability check."],
        [setupToolProblem("tool-unusable", "pdfcpu"), "tool-unusable", { name: "pdfcpu", minimum: "0.16.4" },
            "pdfcpu failed its capability check. Version 0.16.4 or later is required."],
        [setupToolProblem("tool-missing", "vips"), "tool-missing", { name: "vips" }, "vips could not be found."]
    ];
    for (const [issue, code, params, text] of cases) {
        assert.deepEqual([issue.code, issue.stage, issue.params, issue.message], [code, "setup", params, text]);
    }
});
