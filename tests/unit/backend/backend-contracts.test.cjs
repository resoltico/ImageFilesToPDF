"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { isPdfcpuUsable, describeSetupProblems } = require("../../../src/backend/preflight.js");
const { failedRun, issuesOf } = require("../../../src/core/outcomes.js");

test("supported stable backend versions accept multi-digit components and refuse older releases", () => {
    for (const version of ["10.0.0", "0.16.20", "0.17.0"]) {
        assert.equal(isPdfcpuUsable(`version: v${version}`), true);
    }
    for (const text of ["version: v0.15.99", "prefixversion: v1.0.0", "version: v0.16.3"]) {
        assert.equal(isPdfcpuUsable(text), false);
    }
});

test("setup instructions upgrade when any installed backend is unusable", () => {
    const missing = { kind: "missing", tool: "vips" };
    const unusable = { kind: "unusable", tool: "pdfcpu" };
    assert.match(describeSetupProblems([missing, unusable], true), /brew upgrade vips pdfcpu/u);
    assert.doesNotMatch(describeSetupProblems([missing], true), /brew upgrade/u);
});

test("failure reporting preserves prior refusals and diagnostic observations", () => {
    const rejected = [{ path: "/bad.jpg", reason: "unreadable" }];
    const diagnostics = [{ message: "observer unavailable" }];
    const result = failedRun(new Error("report failed"), { documents: [], rejected, issues: [], diagnostics });
    assert.deepEqual(result.rejected, rejected);
    assert.deepEqual(result.diagnostics, diagnostics);
    assert.equal(result.issues[0].stage, "reporting");
    assert.deepEqual(failedRun(new Error("setup failed")).diagnostics, []);
    assert.equal(issuesOf({ issues: [{ code: "operation" }, null] }, "preparation")[0].code, "fault");
});
