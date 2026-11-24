"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { validateMessage } = require("../../../src/core/protocol.js");

const settings = { mode: "combined" };
const context = { count: 1, selectedFolders: 0, folders: ["/photos"], rejected: [] };
const receipt = { state: "setup-failed", documents: [], rejected: [], issues: [{}], diagnostics: [] };
const client = [
    { type: "start", inputItems: ["/photos/one.png"] },
    { type: "continue" }, { type: "cancel" }, { type: "settings", values: settings }, { type: "stop" }
];
const engine = [
    { type: "hello", version: "4.0.0", runtime: "26.13.1" },
    { type: "phase", phase: "Preparing" },
    { type: "progress", done: 0, total: 2 }, { type: "progress", done: 1, total: 2, current: "one.png" },
    { type: "review", context: { ...context, diagnostics: [] } },
    { type: "settings-needed", context }, { type: "settings-invalid", issues: [{}] },
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
    for (const value of [{ type: "start" }, { type: "start", inputItems: {} }, { type: "start", inputItems: [true] },
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
