"use strict";

/*
 * The engine child process as the Finder action drives it through NSTask:
 * streamed output, collected diagnostics, input that may break, and SIGPIPE
 * ignored only while the child runs.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { Buffer } = require("node:buffer");
const { createFoundation, withFoundation } = require("../ports/fake-foundation.cjs");
const { startChild } = require("../../../src/finder/quick-action/engine-child.js");
const { message } = require("../../../src/core/messages.js");

const NODE = "/opt/x/bin/node";

function drain(child) {
    let output = "";
    while (!child.closed()) { output += child.tick(); }
    return output;
}

test("output arrives in pieces, a character split across them is kept whole, and errors are collected", () => {
    const accent = Buffer.from("é", "utf8");
    const foundation = createFoundation({ children: () => ({
        stdout: [Buffer.from("{\"a\":\""), Buffer.concat([Buffer.from("x"), accent.subarray(0, 1)]), Buffer.concat([accent.subarray(1), Buffer.from("\"}\n")])],
        stderr: [Buffer.from("warn ")], status: 3, exitsWithoutInput: true
    }) });
    withFoundation(foundation, () => {
        const child = startChild(NODE, ["engine.cjs", "--serve"]);
        assert.equal(drain(child), "{\"a\":\"xé\"}\n");
        assert.deepEqual(child.result(), { status: 3, diagnostic: "warn " });
        child.close();
    });
    assert.deepEqual(foundation.state.launched, [{ executable: NODE, args: ["engine.cjs", "--serve"], environment: { LC_ALL: "C" } }]);
});

test("input is written until it closes, and a broken pipe is recorded rather than thrown", () => {
    const foundation = createFoundation({ children: () => ({ stdout: [], stderr: [] }) });
    withFoundation(foundation, () => {
        const child = startChild(NODE, ["engine.cjs"]);
        child.send("one\n");
        child.finishInput();
        child.send("two\n");
        assert.deepEqual(foundation.state.tasks[0].input.written, ["one\n"]);
        assert.equal(child.inputBroken(), false);
        child.close();
    });
    const broken = createFoundation({ children: () => ({ stdout: [], stderr: [], brokenInput: true }) });
    withFoundation(broken, () => {
        const child = startChild(NODE, ["engine.cjs"]);
        child.send("one\n");
        assert.equal(child.inputBroken(), true);
        child.send("two\n");
        child.close();
    });
    const unclosable = createFoundation({ children: () => ({ stdout: [], stderr: [], brokenClose: true, exitsWithoutInput: true }) });
    withFoundation(unclosable, () => {
        const child = startChild(NODE, ["engine.cjs"]);
        child.finishInput();
        assert.equal(child.inputBroken(), true);
        child.close();
    });
});

test("SIGPIPE is ignored while the child runs and the previous handling is restored", () => {
    const foundation = createFoundation({ children: () => ({ stdout: [], stderr: [] }) });
    foundation.state.signal = 7;
    withFoundation(foundation, () => { startChild(NODE, ["engine.cjs"]).close(); });
    assert.deepEqual(foundation.state.signals, [[13, 1], [13, 7]]);
    assert.equal(foundation.state.observers.length, 0);
});

test("a child that cannot launch, or ends in invalid UTF-8, is refused in the catalog's words", () => {
    const unlaunched = createFoundation({ children: () => ({ launchFails: true }) });
    withFoundation(unlaunched, () => {
        assert.throws(() => startChild(NODE, []), (error) => error.message === message("engineLaunchFailed"));
    });
    const invalid = createFoundation({ children: () => ({ stdout: [Buffer.from([0xff])], stderr: [], exitsWithoutInput: true }) });
    withFoundation(invalid, () => {
        const child = startChild(NODE, []);
        assert.throws(() => drain(child), (error) => error.message === message("engineInvalidUtf8"));
    });
});

test("Foundation is set up as JXA needs it: imported, with typed blocks and a typed signal()", () => {
    const foundation = createFoundation({ children: () => ({ stdout: [], stderr: [] }) });
    withFoundation(foundation, () => { startChild(NODE, ["engine.cjs"]).close(); });
    assert.ok(foundation.state.imports.includes("Foundation"));
    assert.deepEqual(foundation.state.blocks, [["void", ["id"]], ["void", ["id"]]]);
    assert.deepEqual(foundation.state.bindings, [["signal", ["long", ["int", "long"]]]]);
});

test("a pipe is read only when it says it has data, and not re-armed after its end", () => {
    const foundation = createFoundation({ children: () => ({ stdout: [Buffer.from("a"), Buffer.from("b")], stderr: [], exitsWithoutInput: true }) });
    withFoundation(foundation, () => {
        const child = startChild(NODE, ["engine.cjs"]);
        assert.equal(drain(child), "ab");
        child.close();
    });
    assert.ok(foundation.state.handles.every((handle) => handle.ended && !handle.armedAfterEnd));
});

test("a child that exits before its output is read is drained before it counts as closed", () => {
    const foundation = createFoundation({ children: () => ({ stdout: [Buffer.from("late\n")], stderr: [Buffer.from("said")], exitsAtOnce: true }) });
    withFoundation(foundation, () => {
        const child = startChild(NODE, ["engine.cjs"]);
        assert.equal(child.closed(), false);
        assert.equal(drain(child), "late\n");
        assert.equal(child.result().diagnostic, "said");
        child.close();
    });
});

test("input closes once, and closing the child waits for it to exit", () => {
    const foundation = createFoundation({ children: () => ({ stdout: [Buffer.from("1"), Buffer.from("2")], stderr: [] }) });
    withFoundation(foundation, () => {
        const child = startChild(NODE, ["engine.cjs"]);
        child.finishInput();
        child.finishInput();
        child.close();
    });
    const [task] = foundation.state.tasks;
    assert.equal(task.input.closings, 1);
    assert.equal(task.running, false);
});

test("a child that has already exited when first asked is still read to its end", () => {
    const foundation = createFoundation({ children: () => ({ stdout: [Buffer.from("a"), Buffer.from("b")], stderr: [], exitedAtLaunch: true }) });
    withFoundation(foundation, () => {
        const child = startChild(NODE, ["engine.cjs"]);
        assert.equal(drain(child), "ab");
        child.close();
    });
});
