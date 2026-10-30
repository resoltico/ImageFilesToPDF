"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { reportHeadless, reportNoImages } = require("../../../src/host/reporting.js");
const { runOutcome } = require("../../../src/core/outcomes.js");
const { completionMessage } = require("../../../src/host/completion.js");

const document = { state: "saved", sources: ["/ok.png"], pages: 1, output: "/saved.pdf", issues: [] };
test("CLI writes one receipt and plain summary and returns the contract status", () => {
    for (const [result, code] of [
        [runOutcome([document]), 0], [runOutcome([document], [{ path: "/bad.gif", reason: "unsupported" }]), 1],
        [{ ...runOutcome(), state: "invalid" }, 2], [runOutcome([], [], [{ stage: "setup", message: "brew install vips pdfcpu" }]), 3],
        [{ ...runOutcome(), state: "cancelled" }, 1]
    ]) {
        const writes = [];
        assert.equal(reportHeadless(result, (...args) => writes.push(args), (status) => status), code);
        assert.equal(writes.length, 2);
        assert.equal(writes[0][0], `${JSON.stringify(result)}\n`);
        assert.equal(writes[1][2], true);
        assert.doesNotMatch(writes[1][0], /"documents"|"diagnostic"|stack/u);
    }
});

test("completion labels outputs, failures, recoveries and original refusals without diagnostics", () => {
    const value = runOutcome([document,
        { state: "failed", sources: ["/first.png"], issues: [{ source: "/bad.png", message: "damaged", diagnostic: { stack: "private stack" } }] },
        { state: "recovered", sources: ["/kept.png"], recovery: "/Downloads/kept.pdf", issues: [] },
        { state: "not-started", sources: ["/unattempted.png"], issues: [] }
    ], [{ path: "/a/same.gif", reason: "unsupported" }, { path: "/b/same.gif", reason: "unsupported" }]);
    const text = completionMessage(value);
    for (const expected of ["Stopped.", "Saved to:", "saved.pdf", "/bad.png: damaged", "/Downloads/kept.pdf", "Not started: 1", "/a/same.gif", "/b/same.gif"]) { assert.ok(text.includes(expected), expected); }
    assert.doesNotMatch(text, /private stack|unattempted|diagnostic/u);
});

test("nothing-to-convert retains refusals in the machine receipt", () => {
    const refused = [{ path: "/bad.gif", reason: "unsupported" }];
    const result = reportNoImages({}, true, refused);
    assert.equal(result.state, "incomplete");
    assert.deepEqual(result.rejected, refused);
});

test("an invalid request lists its problems without conversion counts", () => {
    const result = { ...runOutcome([], [], [{ code: "usage", stage: "request", message: "Usage: run it properly" }]), state: "invalid" };
    const writes = [];
    reportHeadless(result, (...args) => writes.push(args), (status) => status);
    assert.equal(writes[1][0], "The request is invalid.\n\nUsage: run it properly\n");
});
