"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { reportHeadless } = require("../../../src/host/command-line/reporting.js");
const { runOutcome, noImagesOutcome } = require("../../../src/core/outcomes.js");
const { completionMessage } = require("../../../src/host/quick-action/completion.js");

const document = { state: "saved", sources: ["/ok.png"], pages: 1, output: "/saved.pdf", issues: [] };
test("CLI writes one receipt and plain summary and returns the contract status", () => {
    for (const [result, code] of [
        [runOutcome([document]), 0], [runOutcome([document], [{ path: "/bad.gif", reason: "unsupported" }]), 1],
        [{ ...runOutcome(), state: "invalid" }, 2], [runOutcome([], [], [{ stage: "setup", message: "brew install vips pdfcpu" }]), 3],
        [{ ...runOutcome(), state: "canceled" }, 1]
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
    const result = noImagesOutcome(refused);
    assert.equal(result.state, "incomplete");
    assert.deepEqual(result.rejected, refused);
});

test("an invalid request lists its problems without conversion counts", () => {
    const result = { ...runOutcome([], [], [{ code: "usage", stage: "request", message: "Usage: run it properly" }]), state: "invalid" };
    const writes = [];
    reportHeadless(result, (...args) => writes.push(args), (status) => status);
    assert.equal(writes[1][0], "The request is invalid.\n\nUsage: run it properly\n");
});

test("the command-line report lists only non-zero counts and ends with the elapsed time, without a version", () => {
    const writes = [];
    const result = { ...runOutcome([document], [{ path: "/a/bad.gif", name: "bad.gif", reason: "This file is not a supported format.", code: "unsupported-format", stage: "selection" }]), elapsed: "1 second" };
    reportHeadless(result, (...args) => writes.push(args), (status) => status);
    const sections = ["Created 1 PDF.", "1 saved; 1 not included.", "Saved to:\n/\nsaved.pdf",
        "Not included from your selection:\n/a/bad.gif: This file is not a supported format.", "Elapsed: 1 second"];
    assert.equal(writes[1][0], `${sections.join("\n\n")}\n`);
    assert.doesNotMatch(writes[1][0], /Image Files to PDF|0 /u);
});

test("a run with nothing to count has no counts line", () => {
    const writes = [];
    reportHeadless({ ...runOutcome([], [], [{ code: "setup", stage: "setup", message: "Install vips." }]) }, (...args) => writes.push(args), (status) => status);
    assert.equal(writes[1][0], "Finished with issues.\nNo PDF was created.\n\nCould not convert:\nInstall vips.\n");
});

test("nothing admitted reports one issue sentence and lists the refusals once", () => {
    const refused = [{ path: "/a/bad.gif", name: "bad.gif", reason: "This file is not a supported format.", code: "unsupported-format", stage: "selection" }];
    const result = noImagesOutcome(refused);
    assert.deepEqual(result.issues, [{ code: "no-images", stage: "selection", message: "None of the selected items can be converted." }]);
    const writes = [];
    reportHeadless(result, (...args) => writes.push(args), (status) => status);
    assert.equal(writes[1][0], "Nothing to convert.\n\n1 not included.\n\nNot included from your selection:\n/a/bad.gif: This file is not a supported format.\n");
});
