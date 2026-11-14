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
        [{ ...runOutcome(), state: "canceled" }, 1],
        [runOutcome([], [], [{ code: "operation", stage: "setup", message: "Unavailable." }, { code: "canceled", stage: "setup", message: "User canceled." }]), 1]
    ]) {
        const writes = [];
        assert.equal(reportHeadless(result, (...args) => writes.push(args), (status) => status), code);
        assert.equal(writes.length, 2);
        assert.equal(writes[1][0], `${JSON.stringify(result)}\n`);
        assert.equal(writes[0][2], true);
        assert.doesNotMatch(writes[0][0], /"documents"|"diagnostic"|stack/u);
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
    assert.equal(writes[0][0], "The request is invalid.\n\nUsage: run it properly\n");
});

test("the command-line report lists only non-zero counts and ends with the elapsed time, without a version", () => {
    const writes = [];
    const result = { ...runOutcome([document], [{ path: "/a/bad.gif", name: "bad.gif", reason: "This file is not a supported format.", code: "unsupported-format", stage: "selection" }]), elapsed: "1 second" };
    reportHeadless(result, (...args) => writes.push(args), (status) => status);
    const sections = ["Created 1 PDF.", "1 saved; 1 not included.", "Saved to:\n/\nsaved.pdf",
        "Not included from your selection:\n/a/bad.gif: This file is not a supported format.", "Elapsed: 1 second"];
    assert.equal(writes[0][0], `${sections.join("\n\n")}\n`);
    assert.doesNotMatch(writes[0][0], /Image Files to PDF|0 /u);
});

test("a run with nothing to count has no counts line", () => {
    const writes = [];
    reportHeadless({ ...runOutcome([], [], [{ code: "setup", stage: "setup", message: "Install vips." }]) }, (...args) => writes.push(args), (status) => status);
    assert.equal(writes[0][0], "Finished with issues.\nNo PDF was created.\n\nOther issues:\nInstall vips.\n");
});

test("nothing admitted reports one issue sentence and lists the refusals once", () => {
    const refused = [{ path: "/a/bad.gif", name: "bad.gif", reason: "This file is not a supported format.", code: "unsupported-format", stage: "selection" }];
    const result = noImagesOutcome(refused);
    assert.deepEqual(result.issues, [{ code: "no-images", stage: "selection", message: "None of the selected items can be converted." }]);
    const writes = [];
    reportHeadless(result, (...args) => writes.push(args), (status) => status);
    assert.equal(writes[0][0], "Nothing to convert.\n\n1 not included.\n\nNot included from your selection:\n/a/bad.gif: This file is not a supported format.\n");
});

test("CLI settings messages use JSON keys and missing/type facts without mutating core results", () => {
    const { validateSettings, DEFAULT_SETTINGS } = require("../../../src/core/settings.js");
    const input = { ...DEFAULT_SETTINGS, mode: null, resolutionLimit: "300", background: [] };
    delete input.quality;
    const result = runOutcome([], [], validateSettings(input).issues);
    const original = JSON.stringify(result);
    const writes = [];
    assert.equal(reportHeadless(result, (text) => writes.push(text), (code) => code), 2);
    const reported = JSON.parse(writes[1]);
    assert.deepEqual(reported.issues.map((issue) => issue.message), [
        "`mode` must be a JSON string, not null.", "`resolutionLimit` must be a JSON number, not a string.",
        "`quality` is missing.", "`background` must be a JSON string, not an array."
    ]);
    assert.ok(writes[0].includes("`quality` is missing."));
    assert.equal(JSON.stringify(result), original);
    const other = runOutcome([], [], validateSettings({ ...DEFAULT_SETTINGS, background: {}, quality: 101, "extra\nkey": true }).issues);
    const lines = [];
    reportHeadless(other, (text) => lines.push(text), (code) => code);
    const messages = JSON.parse(lines[1]).issues.map((issue) => issue.message);
    assert.deepEqual(messages, ['"extra\\nkey" is not a recognized setting.', "`quality` must be a whole number from 1 to 100.", "`background` must be a JSON string, not an object."]);
});


test("receipt transport attempts prose before one JSON, preserves stderr refusal, and reports stdout failure plainly", () => {
    for (const report of ["ok", "false", new Error("stderr failed")]) {
        for (const receipt of ["ok", "false", new Error("stdout failed")]) {
            const calls = [], result = runOutcome([document]);
            const original = JSON.stringify(result);
            let exited = null;
            const write = (text, unused, stderr) => {
                calls.push({ text, stderr: Boolean(stderr) });
                const selected = stderr ? report : receipt;
                if (selected instanceof Error) { throw selected; }
                return selected !== "false";
            };
            const use = () => reportHeadless(result, write, (code) => { exited = code; return code; });
            if (report instanceof Error) { assert.throws(use, (error) => error === report); assert.equal(exited, null); }
            else { assert.equal(use(), report === "ok" && receipt === "ok" ? 0 : 1); }
            assert.equal(calls[0].stderr, true); assert.match(calls[0].text, /^Created 1 PDF/u);
            assert.equal(calls[1].stderr, false); assert.equal(JSON.parse(calls[1].text).state, "complete");
            assert.equal(calls.length, receipt === "ok" ? 2 : 3);
            if (receipt !== "ok") { assert.deepEqual(calls[2], { text: "Standard output could not be completed.\n", stderr: true }); }
            assert.equal(JSON.stringify(result), original);
        }
    }
});


test("receipt serialization drops every structured stack key and preserves messages, paths and internal diagnostics", () => {
    const fault = { code: "fault", stage: "execution", message: "The stack value is user text.",
        diagnostic: { stack: "private issue trace", command: "keep", details: [{ stack: "private nested trace", message: "keep" }] } };
    const result = runOutcome([{ ...document, diagnostics: [{ code: "observer-fault", message: "details", stack: "private document trace" }] }],
        [{ path: "/stack/vector.png", name: "vector.png", reason: "The stack string stays.", code: "unsupported-content", stage: "inspection", diagnostic: { stack: "private refusal trace", loader: "svgload" } }], [fault],
        [{ code: "workspace-retained", stage: "workspace", message: "stack kept as text", stack: "private top diagnostic", diagnostic: { path: "/tmp/ImageFilesToPDF.A123456789", nested: [{ stack: "private nested diagnostic", keep: true }] } }]);
    result.stack = "private top trace";
    const before = JSON.stringify(result), writes = [];
    reportHeadless(result, (text) => writes.push(text), (code) => code);
    const printed = JSON.parse(writes[1]);
    assert.equal(Object.hasOwn(printed, "stack"), false);
    assert.deepEqual(printed.issues[0].diagnostic, { command: "keep", details: [{ message: "keep" }] });
    assert.deepEqual(printed.documents[0].diagnostics, [{ code: "observer-fault", message: "details" }]);
    assert.deepEqual(printed.rejected[0].diagnostic, { loader: "svgload" });
    assert.deepEqual(printed.diagnostics[0].diagnostic, { path: "/tmp/ImageFilesToPDF.A123456789", nested: [{ keep: true }] });
    assert.equal(Object.hasOwn(printed.diagnostics[0], "stack"), false);
    assert.equal(printed.issues[0].message, fault.message); assert.equal(printed.rejected[0].reason, "The stack string stays.");
    assert.equal(printed.rejected[0].path, "/stack/vector.png"); assert.equal(printed.diagnostics[0].message, "stack kept as text");
    assert.equal(JSON.stringify(result), before);
});
