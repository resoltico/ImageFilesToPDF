"use strict";
const { inspectModule } = require("../ports/inspect-module.cjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const { encodeMessage, decodeMessage, requireHello } = require("../../../src/core/protocol.js");
const { validateMessage } = inspectModule(require.resolve("../../../src/core/protocol.js"), ["validateMessage"]);

const settings = { mode: "combined" };
const context = { count: 1, selectedFolders: 0, folders: ["/photos"], rejected: [] };
const issue = { code: "tool-missing", stage: "setup", params: {}, message: "A required tool is missing.", diagnostic: { stack: "private", detail: true } };
const receipt = { state: "setup-failed", documents: [], rejected: [], issues: [issue], diagnostics: [] };
const client = [
    { type: "start", inputItems: ["/photos/one.png"], toolPaths: { vips: "/my tools/vips", pdfcpu: "/bin/pdfcpu" } },
    { type: "continue" }, { type: "cancel" }, { type: "settings", values: settings }, { type: "stop" }
];
const engine = [
    { type: "hello", version: "4.0.0", runtime: "26.13.1" },
    { type: "phase", phase: "Preparing" },
    { type: "progress", done: 0, total: 2 }, { type: "progress", done: 1, total: 2, current: "one.png" },
    { type: "review", context: { ...context, diagnostics: [] } },
    { type: "settings-needed", context }, { type: "settings-invalid", issues: [issue] },
    { type: "outcome", receipt }, { type: "outcome", receipt: { ...receipt, elapsed: "1 second" } }
];

test("each declared message is accepted only from its sender", () => {
    for (const [side, opposite, messages] of [["client", "engine", client], ["engine", "client", engine]]) {
        for (const value of messages) {
            assert.equal(validateMessage(side, value), value);
            assert.throws(() => validateMessage(opposite, value), /message type is invalid/u);
            assert.throws(() => validateMessage(side, { ...value, extra: 7 }), /message fields are invalid/u);
        }
    }
    assert.throws(() => validateMessage("unknown", { type: "stop" }), /message type is invalid/u);
    for (const value of [null, [], 12, {}, { type: ["stop"] }, { type: "constructor" }]) {
        assert.throws(() => validateMessage("client", value), /message type is invalid/u);
    }
});

test("required and optional wire values are separately validated", () => {
    for (const value of [{ type: "start" }, { type: "start", inputItems: [] },
        { type: "start", inputItems: {}, toolPaths: {} }, { type: "start", inputItems: [true], toolPaths: {} },
        { type: "start", inputItems: [], toolPaths: { node: "/bin/node" } },
        { type: "start", inputItems: [], toolPaths: { vipsheader: 2 } },
        { type: "settings", values: null }, { type: "settings", values: [] }, { type: "settings", values: 6 }]) {
        assert.throws(() => validateMessage("client", value), /message fields are invalid/u);
    }
    for (const value of [
        { type: "hello", version: "4" }, { type: "hello", version: 4, runtime: "26.13.1" },
        { type: "phase", phase: null }, { type: "progress", done: -1, total: 2 },
        { type: "progress", done: 0, total: 2.5 }, { type: "progress", done: 1, total: 2, current: false },
        { type: "review", context: { ...context, folders: [2] } }, { type: "review", context: { ...context, diagnostics: false } },
        { type: "settings-needed", context: null }, { type: "settings-invalid", issues: ["bad"] },
        { type: "outcome", receipt: [] }, { type: "outcome", receipt: { ...receipt, state: "unknown" } },
        { type: "outcome", receipt: { ...receipt, elapsed: 16 } }
    ]) {
        assert.throws(() => validateMessage("engine", value), /message fields are invalid/u);
    }
});


test("UTF-8 JSON lines preserve input text and omit receipt stack fields at every depth", () => {
    const selection = { type: "start", inputItems: ["A é.png", "a\nb.png", "🧪.png"], toolPaths: {} };
    const encoded = encodeMessage("client", selection);
    assert.ok(encoded.endsWith("\n"));
    assert.equal(encoded.split("\n").length, 2);
    assert.deepEqual(decodeMessage("client", encoded), selection);
    const event = { type: "outcome", receipt };
    const decoded = decodeMessage("engine", encodeMessage("engine", event));
    assert.deepEqual(decoded.receipt.issues[0].diagnostic, { detail: true });
    assert.equal(event.receipt.issues[0].diagnostic.stack, "private");
    assert.throws(() => decodeMessage("client", "{"), SyntaxError);
});

test("the client refuses a mismatched engine version or runtime before starting", () => {
    const hello = { type: "hello", version: "4.0.0", runtime: "26.13.1" };
    assert.doesNotThrow(() => requireHello(hello, "4.0.0"));
    for (const mismatch of [null, { type: "phase" }, { ...hello, version: "3.0.0" }, { ...hello, runtime: "26.0.0" }]) {
        assert.throws(() => requireHello(mismatch, "4.0.0"), /expected version/u);
    }
});

test("outcomes and review contexts reject malformed nested records", () => {
    const saved = { state: "saved", sources: ["/photo.png"], output: "/photo.pdf", pages: 1, issues: [], fatal: false, diagnostics: [] };
    const recovered = { state: "recovered", sources: ["/photo.png"], recovery: "/home/Downloads/photo.pdf", pages: 1, issues: [issue] };
    const failed = { state: "failed", sources: ["/photo.png"], pages: 0, issues: [issue] };
    const refused = { path: "/notes.pdf", code: "unsupported-format", stage: "selection", name: "notes.pdf", reason: "Unsupported.", diagnostic: {} };
    const asOutcome = (documents) => ({ type: "outcome", receipt: { ...receipt, state: "incomplete", documents, rejected: [refused] } });
    assert.doesNotThrow(() => validateMessage("engine", asOutcome([saved, recovered, failed])));
    assert.doesNotThrow(() => validateMessage("engine", { type: "review", context: { ...context, rejected: [refused] } }));
    for (const record of [
        { ...saved, output: undefined }, { ...saved, recovery: "/elsewhere.pdf" }, { ...saved, fatal: "yes" },
        { ...saved, sources: [false] }, { ...saved, pages: -1 }, { ...saved, state: "validated" },
        { ...failed, issues: [{ ...issue, params: null }] }, { ...recovered, state: "failed" },
        ...[null, true]
    ]) { assert.throws(() => validateMessage("engine", asOutcome([record])), /message fields are invalid/u); }
    assert.throws(() => validateMessage("engine", { type: "review", context: { ...context, rejected: [{ ...refused, reason: false }] } }), /message fields are invalid/u);
    assert.throws(() => validateMessage("engine", { type: "settings-invalid", issues: [{}] }), /message fields are invalid/u);
});
