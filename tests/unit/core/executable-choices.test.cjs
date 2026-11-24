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
