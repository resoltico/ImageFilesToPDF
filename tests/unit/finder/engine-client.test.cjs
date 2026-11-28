"use strict";

/*
 * The Finder action's side of the engine session: finding a Node that is new
 * enough, then the JSON-lines conversation with the engine child. The child is
 * a script here, so every turn of the conversation can be set up exactly.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { createFoundation, withFoundation } = require("../ports/fake-foundation.cjs");
const { engineSession } = require("../../../src/finder/quick-action/engine-client.js");
const { VERSION, MINIMUM_NODE_VERSION } = require("../../../src/core/product.js");
const { OperationError, UserCanceled } = require("../../../src/core/errors.js");
const { message } = require("../../../src/core/messages.js");
const { chosenExecutableIssue } = require("../../../src/core/setup.js");

const BIN = "/opt/x/bin";
const NODE = `${BIN}/node`;
const RECEIPT = { state: "complete", documents: [], rejected: [], issues: [], diagnostics: [] };
const CONTEXT = { count: 1, selectedFolders: 0, folders: [], rejected: [] };
const HELLO = { type: "hello", version: VERSION, runtime: MINIMUM_NODE_VERSION };
const OUTCOME = { type: "outcome", receipt: RECEIPT };
const line = (event) => `${JSON.stringify(event)}\n`;

/*
 * A child whose output is a queue: the engine's opening lines, then whatever
 * `answer` queues in reply to each line the client sends. It has exited once
 * the queue is empty.
 */
function scriptedChild({ output = [], answer = () => [], status = 0, diagnostic = "", inputBroken = false } = {}) {
    const queue = [...output];
    const child = {
        sent: [], inputFinished: false, closedCount: 0,
        send(text) { const event = JSON.parse(text); child.sent.push(event); queue.push(...answer(event)); },
        finishInput() { child.inputFinished = true; },
        closed: () => queue.length === 0,
        tick: () => queue.shift(),
        result: () => ({ status, diagnostic }),
        inputBroken: () => inputBroken,
        close() { child.closedCount += 1; }
    };
    return child;
}

function versionChild(output, status = 0) {
    return scriptedChild({ output: [output], status });
}

function launcher(engine, versions = { [NODE]: () => versionChild(`v${MINIMUM_NODE_VERSION}\n`) }) {
    const launched = [];
    const launch = (executable, args) => {
        launched.push({ executable, args });
        return args[0] === "--version" ? versions[executable]() : engine;
    };
    return { launch, launched };
}

function hooks(overrides = {}) {
    const calls = [];
    return {
        calls,
        progress: (event) => calls.push(["progress", event.type]),
        review: (context) => calls.push(["review", context.count]),
        settings: (context, issues) => { calls.push(["settings", issues?.length ?? null]); return { quality: 80 }; },
        stopped: () => false,
        ...overrides
    };
}

function session(engine, hookSet, options = {}) {
    const foundation = createFoundation({ executables: [NODE], home: "/Users/someone" });
    const { launch, launched } = launcher(engine, options.versions);
    const materialized = [];
    const materialize = (bundle, home) => { materialized.push([bundle, home]); return `${home}/engine.cjs`; };
    const run = () => withFoundation(foundation, () => engineSession("BUNDLE", ["/in/a.png"], hookSet,
        { directories: [BIN], launch, materialize, ...options.session }));
    return { run, launched, materialized };
}

function rejectsWith(run, id) {
    assert.throws(run, (error) => error instanceof OperationError && error.message === message(id));
}

test("a conversation answers review and settings, reports progress, and returns the receipt", () => {
    const engine = scriptedChild({
        output: [line(HELLO)],
        answer: (event) => ({
            start: [line({ type: "phase", phase: "checking" }), line({ type: "progress", done: 0, total: 1 }), line({ type: "review", context: CONTEXT })],
            continue: [line({ type: "settings-needed", context: CONTEXT })],
            settings: [line(OUTCOME)]
        })[event.type] ?? []
    });
    const hookSet = hooks();
    const { run, launched, materialized } = session(engine, hookSet, { session: { chosen: { vips: "/v/vips", other: "/x" } } });
    assert.deepEqual(run(), RECEIPT);
    assert.deepEqual(hookSet.calls, [["progress", "phase"], ["progress", "progress"], ["review", 1], ["settings", null]]);
    assert.deepEqual(engine.sent, [{ type: "start", inputItems: ["/in/a.png"], toolPaths: { vips: "/v/vips" } },
        { type: "continue" }, { type: "settings", values: { quality: 80 } }]);
    assert.deepEqual(materialized, [["BUNDLE", "/Users/someone"]]);
    assert.deepEqual(launched.at(-1), { executable: NODE, args: ["/Users/someone/engine.cjs", "--serve"] });
    assert.equal(engine.inputFinished, true);
    assert.equal(engine.closedCount, 1);
});

test("chosen tools are passed on by name, and an explicit home is used as given", () => {
    const engine = scriptedChild({ output: [line(HELLO)], answer: () => [line(OUTCOME)] });
    const { run, materialized } = session(engine, hooks(), { session: { chosen: { node: NODE, pdfcpu: "/p/pdfcpu" }, home: "/elsewhere" } });
    run();
    assert.deepEqual(engine.sent[0].toolPaths, { pdfcpu: "/p/pdfcpu" });
    assert.deepEqual(materialized, [["BUNDLE", "/elsewhere"]]);
});

test("invalid settings are asked again, and a canceled settings form stops the engine", () => {
    const engine = scriptedChild({
        output: [line(HELLO)],
        answer: (event) => ({
            start: [line({ type: "settings-needed", context: CONTEXT })],
            settings: [line({ type: "settings-invalid", issues: [] })],
            stop: [line({ type: "settings-invalid", issues: [] }), line(OUTCOME)]
        })[event.type] ?? []
    });
    let asked = 0;
    const hookSet = hooks({ settings() { asked += 1; if (asked === 2) { throw new UserCanceled(); } return {}; } });
    assert.deepEqual(session(engine, hookSet).run(), RECEIPT);
    // Once stopping, a further question is not answered.
    assert.deepEqual(engine.sent.map(({ type }) => type), ["start", "settings", "stop"]);
    assert.equal(asked, 2);
});

test("a canceled review is answered with cancel", () => {
    const engine = scriptedChild({
        output: [line(HELLO)],
        answer: (event) => (event.type === "start" ? [line({ type: "review", context: CONTEXT })] : [line(OUTCOME)])
    });
    const hookSet = hooks({ review() { throw new UserCanceled(); } });
    session(engine, hookSet).run();
    assert.deepEqual(engine.sent.map(({ type }) => type), ["start", "cancel"]);
});

test("a hook's own failure is not taken for a cancel", () => {
    const engine = scriptedChild({ output: [line(HELLO)], answer: () => [line({ type: "review", context: CONTEXT })] });
    const failure = new Error("broken form");
    assert.throws(session(engine, hooks({ review() { throw failure; } })).run, (error) => error === failure);
    assert.equal(engine.closedCount, 1);
});

test("Stop is sent once, between reads, when the person asks for it", () => {
    let stopped = false;
    const engine = scriptedChild({
        output: [line(HELLO)],
        answer: (event) => (event.type === "start" ? [line({ type: "phase", phase: "a" }), "", line(OUTCOME)] : [])
    });
    const hookSet = hooks({ progress() { stopped = true; }, stopped: () => stopped });
    session(engine, hookSet).run();
    assert.deepEqual(engine.sent.map(({ type }) => type), ["start", "stop"]);
});

test("messages out of order are refused", () => {
    for (const events of [
        [{ type: "settings-invalid", issues: [] }],
        [{ type: "settings-needed", context: CONTEXT }, { type: "review", context: CONTEXT }],
        [{ type: "review", context: CONTEXT }, { type: "review", context: CONTEXT }],
        [{ type: "settings-needed", context: CONTEXT }, { type: "settings-needed", context: CONTEXT }],
        [OUTCOME, HELLO]
    ]) {
        const engine = scriptedChild({ output: [line(HELLO), ...events.map(line)] });
        rejectsWith(session(engine, hooks()).run, "engineMessageOrder");
    }
});

test("an engine that ends badly fails the session, keeping what it said", () => {
    const silent = scriptedChild({ status: 2, diagnostic: "crashed" });
    assert.throws(session(silent, hooks()).run, (error) => error.message === message("engineSessionFailed") &&
        error.diagnostic.message === "crashed" && error.diagnostic.status === 2);
    for (const engine of [
        scriptedChild({ output: [line(HELLO)], answer: () => [line(OUTCOME)], status: 1 }),
        scriptedChild({ output: [line(HELLO)], answer: () => [line(OUTCOME)], inputBroken: true })
    ]) {
        assert.throws(session(engine, hooks()).run, (error) => error.message === message("engineSessionFailed") && assert.deepEqual(error.outcome, RECEIPT) === undefined);
    }
    const unfinished = scriptedChild({ output: [line(HELLO)] });
    assert.throws(session(unfinished, hooks()).run, (error) => error.message === message("engineSessionFailed") && error.outcome === undefined);
});

test("a last line without its end is incomplete only when the engine exited cleanly", () => {
    rejectsWith(session(scriptedChild({ output: [line(HELLO), "{\"type\""] }), hooks()).run, "engineMessageIncomplete");
    for (const engine of [scriptedChild({ output: [line(HELLO), "{"], status: 1 }), scriptedChild({ output: [line(HELLO), "{"], inputBroken: true })]) {
        rejectsWith(session(engine, hooks()).run, "engineSessionFailed");
    }
});

test("a hello from another version is refused", () => {
    const engine = scriptedChild({ output: [line({ ...HELLO, version: "0.0.1" })] });
    assert.throws(session(engine, hooks()).run, (error) => error.message === message("engineVersionMismatch"));
});

test("Node is found only where it is executable, answers, and is new enough", () => {
    const engine = scriptedChild({ output: [line(HELLO)], answer: () => [line(OUTCOME)] });
    const versions = { [NODE]: () => versionChild("v20.0.0\n") };
    assert.throws(session(engine, hooks(), { versions }).run, (error) => error.issues.length === 1 &&
        error.issues[0].code === "runtime-unavailable" && error.issues[0].params.found[0].version === "20.0.0");
    const odd = { [NODE]: () => versionChild("not a version") };
    assert.throws(session(engine, hooks(), { versions: odd }).run, (error) => error.issues[0].params.found[0].version === undefined);
    const failing = { [NODE]: () => versionChild(`v${MINIMUM_NODE_VERSION}\n`, 1) };
    assert.throws(session(engine, hooks(), { versions: failing }).run, (error) => error.issues[0].params.found[0].version === MINIMUM_NODE_VERSION);
    const unlaunchable = { [NODE]: () => { throw new OperationError("no launch"); } };
    assert.throws(session(engine, hooks(), { versions: unlaunchable }).run, (error) => error.issues[0].params.found[0].path === NODE);
    const fault = new TypeError("fault");
    assert.throws(session(engine, hooks(), { versions: { [NODE]: () => { throw fault; } } }).run, (error) => error === fault);
    assert.throws(session(engine, hooks(), { session: { directories: ["/missing", "relative"] } }).run,
        (error) => error.issues.length === 1 && error.issues[0].params.found.length === 0);
});

test("a chosen Node that does not qualify is reported with the reason for the choice", () => {
    const engine = scriptedChild({ output: [line(HELLO)], answer: () => [line(OUTCOME)] });
    assert.throws(session(engine, hooks(), { session: { chosen: { node: "/chosen/node" } } }).run,
        (error) => error.issues.length === 2 && error.issues[1].code === "runtime-unavailable");
    const { run, launched } = session(engine, hooks(), { session: { chosen: { node: NODE }, directories: ["/ignored"] } });
    run();
    assert.equal(launched[0].executable, NODE);
});

test("the version check closes the child's input, closes the child, and reads only a plain version", () => {
    const engine = scriptedChild({ output: [line(HELLO)], answer: () => [line(OUTCOME)] });
    const probes = [];
    const probe = (output) => ({ [NODE]: () => { const child = versionChild(output); probes.push(child); return child; } });
    session(engine, hooks(), { versions: probe(`v${MINIMUM_NODE_VERSION}\n`) }).run();
    assert.equal(probes[0].inputFinished, true);
    assert.equal(probes[0].closedCount, 1);
    for (const [output, version] of [["26.13.12-rc.1\n", "26.13.12-rc.1"], ["26.13.1-dev", "26.13.1-dev"],
        ["26.13.12 (custom)", undefined], ["node 26.13.12", undefined]]) {
        assert.throws(session(engine, hooks(), { versions: probe(output) }).run,
            (error) => error.issues[0].params.found[0].version === version, output);
    }
    assert.throws(session(engine, hooks(), { session: { chosen: { node: "/chosen/node" } } }).run,
        (error) => assert.deepEqual(error.issues[0], chosenExecutableIssue("node", "/chosen/node")) === undefined);
});

test("several lines arriving together are read one at a time", () => {
    const engine = scriptedChild({ output: [line(HELLO) + line({ type: "phase", phase: "a" })], answer: () => [line(OUTCOME)] });
    const hookSet = hooks();
    assert.deepEqual(session(engine, hookSet).run(), RECEIPT);
    assert.deepEqual(hookSet.calls, [["progress", "phase"]]);
});

test("after a cancel nothing more is asked, and after the outcome Stop is not sent", () => {
    const engine = scriptedChild({
        output: [line(HELLO)],
        answer: (event) => (event.type === "start" ? [line({ type: "review", context: CONTEXT })] : [line({ type: "settings-needed", context: CONTEXT }), line(OUTCOME)])
    });
    const hookSet = hooks({ review() { throw new UserCanceled(); } });
    session(engine, hookSet).run();
    assert.deepEqual(engine.sent.map(({ type }) => type), ["start", "cancel"]);
    let pulses = 0;
    const late = scriptedChild({ output: [line(HELLO)], answer: () => [line(OUTCOME), ""] });
    session(late, hooks({ stopped: () => { pulses += 1; return pulses >= 3; } })).run();
    assert.deepEqual(late.sent.map(({ type }) => type), ["start"]);
});

test("Foundation is imported before Node is looked for", () => {
    const foundation = createFoundation({ executables: [NODE] });
    const engine = scriptedChild({ output: [line(HELLO)], answer: () => [line(OUTCOME)] });
    const { launch } = launcher(engine);
    withFoundation(foundation, () => engineSession("B", [], hooks(), { directories: [BIN], launch, materialize: () => "/e.cjs", home: "/h" }));
    assert.ok(foundation.state.imports.includes("Foundation"));
});
