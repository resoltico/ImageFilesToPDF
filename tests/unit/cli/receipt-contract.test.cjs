"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { report } = require("../../../src/cli/transport.js");
function reportHeadless(result, take) {
    const stream = (stderr) => ({ on() { return this; }, write(data, done) { try { done(take(data.toString("utf8"), undefined, stderr) === false ? new Error("write refused") : null); } catch (error) { done(error); } } });
    return report(result, stream(false), stream(true));
}
const { runOutcome, noImagesOutcome } = require("../../../src/core/outcomes.js");

const document = { state: "saved", sources: ["/ok.png"], pages: 1, output: "/saved.pdf", issues: [] };
test("CLI writes one receipt and plain summary and returns the contract status", async () => {
    for (const [result, code] of [
        [runOutcome([document]), 0], [runOutcome([document], [{ path: "/bad.gif", reason: "unsupported" }]), 1],
        [{ ...runOutcome(), state: "invalid-request" }, 2], [runOutcome([], [], [{ stage: "setup", message: "brew install vips pdfcpu" }]), 3],
        [{ ...runOutcome(), state: "canceled" }, 1],
        [runOutcome([], [], [{ code: "operation", stage: "setup", message: "Unavailable." }, { code: "canceled", stage: "setup", message: "User canceled." }]), 1]
    ]) {
        const writes = [];
        // Each stream fixture belongs to one receipt.
        // eslint-disable-next-line no-await-in-loop
        assert.equal(await reportHeadless(result, (...args) => writes.push(args)), code);
        assert.equal(writes.length, 2);
        assert.equal(writes[1][0], `${JSON.stringify(result)}\n`);
        assert.equal(writes[0][2], true);
        assert.doesNotMatch(writes[0][0], /"documents"|"diagnostic"|stack/u);
    }
});

test("nothing-to-convert retains refusals in the machine receipt", () => {
    const refused = [{ path: "/bad.gif", reason: "unsupported" }];
    const result = noImagesOutcome(refused);
    assert.equal(result.state, "incomplete");
    assert.deepEqual(result.rejected, refused);
});

test("an invalid request lists its problems without conversion counts", async () => {
    const result = { ...runOutcome([], [], [{ code: "usage", stage: "request", message: "Usage: run it properly" }]), state: "invalid-request" };
    const writes = [];
    await reportHeadless(result, (...args) => writes.push(args));
    assert.equal(writes[0][0], "The request is invalid.\n\nUsage: run it properly\n");
});

test("the command-line report lists only non-zero counts and ends with the elapsed time, without a version", async () => {
    const writes = [];
    const result = { ...runOutcome([document], [{ path: "/a/bad.gif", name: "bad.gif", reason: "This file is not a supported format.", code: "unsupported-format", stage: "selection" }]), elapsed: "1 second" };
    await reportHeadless(result, (...args) => writes.push(args));
    const sections = ["Created 1 PDF.", "1 saved; 1 not included.", "Saved to:\n/\nsaved.pdf",
        "Not included from your selection:\n/a/bad.gif: This file is not a supported format.", "Elapsed: 1 second"];
    assert.equal(writes[0][0], `${sections.join("\n\n")}\n`);
    assert.doesNotMatch(writes[0][0], /Image Files to PDF|0 /u);
});

test("a run with nothing to count has no counts line", async () => {
    const writes = [];
    await reportHeadless({ ...runOutcome([], [], [{ code: "setup", stage: "setup", message: "Install vips." }]) }, (...args) => writes.push(args));
    assert.equal(writes[0][0], "Setup failed.\n\nInstall vips.\n");
});

test("nothing admitted reports one issue sentence and lists the refusals once", async () => {
    const refused = [{ path: "/a/bad.gif", name: "bad.gif", reason: "This file is not a supported format.", code: "unsupported-format", stage: "selection" }];
    const result = noImagesOutcome(refused);
    assert.deepEqual(result.issues, [{ code: "no-images", stage: "selection", params: {}, message: "None of the selected items can be converted." }]);
    const writes = [];
    await reportHeadless(result, (...args) => writes.push(args));
    assert.equal(writes[0][0], "Nothing to convert.\n\n1 not included.\n\nNot included from your selection:\n/a/bad.gif: This file is not a supported format.\n");
});

test("CLI settings messages use JSON keys and missing/type facts without mutating core results", async () => {
    const { validateSettings, DEFAULT_SETTINGS } = require("../../../src/core/settings.js");
    const input = { ...DEFAULT_SETTINGS, mode: null, resolutionLimit: "300", background: [] };
    delete input.quality;
    const result = runOutcome([], [], validateSettings(input, "keys").issues);
    const original = JSON.stringify(result);
    const writes = [];
    assert.equal(await reportHeadless(result, (text) => writes.push(text)), 2);
    const reported = JSON.parse(writes[1]);
    assert.deepEqual(reported.issues.map((issue) => issue.message), [
        "`mode` must be a JSON string, not null.", "`resolutionLimit` must be a JSON number, not a string.",
        "`quality` is missing.", "`background` must be a JSON string, not an array."
    ]);
    assert.ok(writes[0].includes("`quality` is missing."));
    assert.equal(JSON.stringify(result), original);
    const other = runOutcome([], [], validateSettings({ ...DEFAULT_SETTINGS, background: {}, quality: 101, "extra\nkey": true }, "keys").issues);
    const lines = [];
    await reportHeadless(other, (text) => lines.push(text));
    const messages = JSON.parse(lines[1]).issues.map((issue) => issue.message);
    assert.deepEqual(messages, ['"extra\\nkey" is not a recognized setting.', "`quality` must be a whole number from 1 to 100.", "`background` must be a JSON string, not an object."]);
});


test("receipt transport attempts prose before one JSON, preserves stderr refusal, and reports stdout failure plainly", async () => {
    for (const delivery of ["ok", "false", new Error("stderr failed")]) {
        for (const receipt of ["ok", "false", new Error("stdout failed")]) {
            const calls = [], result = runOutcome([document]);
            const original = JSON.stringify(result);
            const write = (text, unused, stderr) => {
                calls.push({ text, stderr: Boolean(stderr) });
                const selected = stderr ? delivery : receipt;
                if (selected instanceof Error) { throw selected; }
                return selected !== "false";
            };
            // Exercise each transport outcome through one ordered report.
            // eslint-disable-next-line no-await-in-loop
            assert.equal(await reportHeadless(result, write), delivery === "ok" && receipt === "ok" ? 0 : 1);
            assert.equal(calls[0].stderr, true); assert.match(calls[0].text, /^Created 1 PDF/u);
            assert.equal(calls[1].stderr, false); assert.equal(JSON.parse(calls[1].text).state, "complete");
            assert.equal(calls.length, receipt === "ok" ? 2 : 3);
            if (receipt !== "ok") { assert.deepEqual(calls[2], { text: "Standard output could not be completed.\n", stderr: true }); }
            assert.equal(JSON.stringify(result), original);
        }
    }
});


test("receipt serialization drops every structured stack key and preserves messages, paths and internal diagnostics", async () => {
    const fault = { code: "fault", stage: "execution", message: "The stack value is user text.",
        diagnostic: { stack: "private issue trace", command: "keep", details: [{ stack: "private nested trace", message: "keep" }] } };
    const result = runOutcome([{ ...document, diagnostics: [{ code: "observer-fault", message: "details", stack: "private document trace" }] }],
        [{ path: "/stack/vector.png", name: "vector.png", reason: "The stack string stays.", code: "unsupported-content", stage: "inspection", diagnostic: { stack: "private refusal trace", loader: "svgload" } }], [fault],
        [{ code: "workspace-retained", stage: "workspace", message: "stack kept as text", stack: "private top diagnostic", diagnostic: { path: "/tmp/run-A12345", nested: [{ stack: "private nested diagnostic", keep: true }] } }]);
    result.stack = "private top trace";
    const before = JSON.stringify(result), writes = [];
    await reportHeadless(result, (text) => writes.push(text));
    const printed = JSON.parse(writes[1]);
    assert.equal(Object.hasOwn(printed, "stack"), false);
    assert.deepEqual(printed.issues[0].diagnostic, { command: "keep", details: [{ message: "keep" }] });
    assert.deepEqual(printed.documents[0].diagnostics, [{ code: "observer-fault", message: "details" }]);
    assert.deepEqual(printed.rejected[0].diagnostic, { loader: "svgload" });
    assert.deepEqual(printed.diagnostics[0].diagnostic, { path: "/tmp/run-A12345", nested: [{ keep: true }] });
    assert.equal(Object.hasOwn(printed.diagnostics[0], "stack"), false);
    assert.equal(printed.issues[0].message, fault.message); assert.equal(printed.rejected[0].reason, "The stack string stays.");
    assert.equal(printed.rejected[0].path, "/stack/vector.png"); assert.equal(printed.diagnostics[0].message, "stack kept as text");
    assert.equal(JSON.stringify(result), before);
});
