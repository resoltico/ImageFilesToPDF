"use strict";

/*
 * The Finder controller's own decisions, with every port a stand-in: what a
 * Finder item becomes, when a run is reported, and how a missing tool is
 * offered for choosing until a run no longer needs one.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { inspectModule } = require("../ports/inspect-module.cjs");
const { createFoundation, withFoundation } = require("../ports/fake-foundation.cjs");
const { UserCanceled, OperationError } = require("../../../src/core/errors.js");

const MAIN = require.resolve("../../../src/finder/quick-action/main.js");
const { runQuickAction, rawItem, finder, progressObserver } = inspectModule(MAIN, ["runQuickAction", "rawItem", "finder", "progressObserver"]);

const completeRun = () => ({ state: "complete", documents: [], rejected: [], issues: [], diagnostics: [] });
const missingNode = () => ({ state: "setup-failed", documents: [], rejected: [],
    issues: [{ code: "runtime-unavailable", stage: "setup", params: {}, message: "Node is missing." }], diagnostics: [] });

function ports(overrides = {}) {
    const events = [];
    const reports = [];
    return {
        events, reports,
        application: () => "app",
        openProgress: () => ({ diagnostics: ["panel"], pause: () => events.push("pause"), close: () => events.push("close"), progress: () => undefined, stopped: () => false }),
        collect: (app, input) => ({ inputItems: input }),
        review: () => events.push("review"),
        settings: () => { events.push("settings"); return {}; },
        noImages: (app, rejected) => { events.push(["noImages", rejected]); return "no images"; },
        result: (app, report) => { events.push(["result", report.state]); reports.push(report); return undefined; },
        runEngine: () => completeRun(),
        ...overrides
    };
}

test("a Finder item is its URL when it has one, and its text otherwise", () => {
    assert.equal(rawItem("/a.png"), "/a.png");
    assert.equal(rawItem({ url: () => "/b.png" }), "/b.png");
    assert.equal(rawItem({ url: "not callable", toString: () => "item" }), "item");
    assert.equal(rawItem(null), "null");
    assert.equal(rawItem({ url() { throw new Error("gone"); }, toString: () => "unreachable item" }), "unreachable item");
});

test("the production ports are the application, and the engine with the embedded bundle", () => {
    const saved = globalThis.Application;
    globalThis.Application = { currentApplication: () => ({}) };
    try { assert.deepEqual(finder.application(), { includeStandardAdditions: true }); }
    finally { globalThis.Application = saved; }
    // No Node in a bare Foundation: the engine is not reached, and that is said.
    assert.throws(() => withFoundation(createFoundation(), () => finder.runEngine(["/a.png"], {}, {})),
        (error) => error instanceof OperationError && error.issues.length === 1 && error.issues[0].code === "runtime-unavailable");
    // A chosen Node is passed on, and named when it does not qualify.
    assert.throws(() => withFoundation(createFoundation(), () => finder.runEngine(["/a.png"], {}, { node: "/chosen/node" })),
        (error) => error.issues.length === 2);
});

test("the production ports are used when none are given", () => {
    const saved = globalThis.Application;
    const unavailable = new Error("no application");
    globalThis.Application = { currentApplication() { throw unavailable; } };
    try { assert.throws(() => runQuickAction(["/a.png"]), (error) => error === unavailable); }
    finally { globalThis.Application = saved; }
});

test("a canceled or empty-handed run says nothing; a run with documents is reported", () => {
    const quiet = ports({ runEngine: () => ({ ...completeRun(), state: "canceled" }) });
    assert.equal(runQuickAction(["/a.png"], quiet), undefined);
    assert.deepEqual(quiet.events, ["close"]);
    const kept = ports({ runEngine: () => ({ ...completeRun(), state: "canceled", documents: [{}] }) });
    runQuickAction(["/a.png"], kept);
    assert.deepEqual(kept.events, ["close", ["result", "canceled"]]);
    for (const overrides of [{ runEngine() { throw new UserCanceled(); } }, { collect() { throw new UserCanceled(); } }]) {
        const canceled = ports(overrides);
        assert.equal(runQuickAction(["/a.png"], canceled), undefined);
        assert.deepEqual(canceled.events, ["close"]);
    }
});

test("a failure is reported as a failed run, carrying what the engine had done", () => {
    const outcome = completeRun();
    const failing = ports({ runEngine() { throw new OperationError("engine failed", { outcome }); } });
    runQuickAction(["/a.png"], failing);
    assert.deepEqual(failing.events, ["close", ["result", "incomplete"]]);
    const collecting = ports({ collect() { throw new Error("no selection"); } });
    runQuickAction([], collecting);
    assert.deepEqual(collecting.events.at(-1), ["result", "setup-failed"]);
    // JavaScript for Automation can throw values that are not errors.
    for (const overrides of [
        // eslint-disable-next-line no-throw-literal -- A host bridge may throw null.
        { runEngine() { throw null; } },
        // eslint-disable-next-line no-throw-literal -- A host bridge may throw null.
        { collect() { throw null; } }
    ]) {
        const odd = ports({ ...overrides, executableMemory: () => ({ recalled: {}, diagnostics: ["memory"], remember: () => undefined }) });
        runQuickAction(["/a.png"], odd);
        assert.equal(odd.reports[0].issues.length, 1);
        // A run that threw is still a receipt of the run, carrying what was remembered.
        assert.equal(odd.reports[0].diagnostics.includes("memory"), Object.hasOwn(overrides, "runEngine"));
    }
});

test("what the panel and the remembered tools recorded goes into the report", () => {
    const plain = ports();
    runQuickAction(["/a.png"], plain);
    assert.deepEqual(plain.reports[0].diagnostics, ["panel"]);
    const remembering = ports({ executableMemory: () => ({ recalled: {}, diagnostics: ["memory"], remember: () => undefined }) });
    runQuickAction(["/a.png"], remembering);
    assert.deepEqual(remembering.reports[0].diagnostics, ["memory", "panel"]);
});

test("a run that throws for want of a tool still offers the choice", () => {
    const runs = [];
    const choosing = ports({
        chooseExecutable: (app, name) => `/chosen/${name}`,
        runEngine(items, hooks, chosen) {
            runs.push(chosen.node);
            if (runs.length === 1) { throw new OperationError("no node", { issues: missingNode().issues }); }
            return completeRun();
        }
    });
    runQuickAction(["/a.png"], choosing);
    assert.deepEqual(runs, [undefined, "/chosen/node"]);
});

test("no images is its own report, and a canceled result report stays silent", () => {
    const none = ports({ runEngine: () => ({ ...completeRun(), issues: [{ code: "no-images" }], rejected: ["r"] }) });
    assert.equal(runQuickAction([], none), "no images");
    assert.deepEqual(none.events.at(-1), ["noImages", ["r"]]);
    assert.equal(runQuickAction([], ports({ result() { throw new UserCanceled(); } })), undefined);
});

test("settings asked again without a context keep the last one", () => {
    const asked = [];
    runQuickAction(["/a.png"], ports({
        settings: (app, context, { problems }) => { asked.push([context.count, problems]); return {}; },
        runEngine(items, hooks) {
            hooks.settings({ count: 2 });
            hooks.settings(undefined, ["bad"]);
            hooks.review({ count: 2 });
            return completeRun();
        }
    }));
    assert.deepEqual(asked, [[2, undefined], [2, ["bad"]]]);
});

test("the panel is paused before each question", () => {
    const asking = ports({ runEngine(items, hooks) { hooks.review({}); hooks.settings({}); return completeRun(); } });
    runQuickAction(["/a.png"], asking);
    assert.deepEqual(asking.events.slice(0, 4), ["pause", "review", "pause", "settings"]);
});

test("a missing tool is chosen and remembered until the run no longer needs it", () => {
    const remembered = [];
    const runs = [];
    const choosing = ports({
        executableMemory: () => ({ recalled: { vips: "/v" }, diagnostics: ["memory"], remember: (name, path) => remembered.push([name, path]) }),
        chooseExecutable: () => "/n/node",
        runEngine(items, hooks, chosen) { runs.push({ ...chosen }); return runs.length === 1 ? missingNode() : completeRun(); }
    });
    runQuickAction(["/a.png"], choosing);
    assert.deepEqual(runs, [{ vips: "/v" }, { vips: "/v", node: "/n/node" }]);
    assert.deepEqual(remembered, [["node", "/n/node"]]);
    assert.ok(choosing.events.includes("pause"));
});

test("declining to choose ends the run quietly, and without memory nothing is remembered", () => {
    const declined = ports({ chooseExecutable: () => undefined, runEngine: missingNode });
    assert.equal(runQuickAction(["/a.png"], declined), undefined);
    const runs = [];
    const forgetful = ports({ chooseExecutable: () => "/n/node", runEngine(items, hooks, chosen) { runs.push(chosen.node); return runs.length === 1 ? missingNode() : completeRun(); } });
    runQuickAction(["/a.png"], forgetful);
    assert.deepEqual(runs, [undefined, "/n/node"]);
    // Without a chooser a missing tool is simply reported.
    const reported = ports({ runEngine: missingNode });
    runQuickAction(["/a.png"], reported);
    assert.deepEqual(reported.events.at(-1), ["result", "setup-failed"]);
});

test("the progress panel's own failures are recorded once, and Stop from it is honoured", () => {
    let closed = 0;
    const faulty = progressObserver(() => ({
        start() { throw new Error("start failed"); },
        pause() { throw new Error("unreachable"); },
        close() { closed += 1; throw new Error("close failed"); }
    }));
    faulty.progress({ type: "progress", done: 0, total: 1 });
    faulty.pause();
    faulty.close();
    assert.equal(closed, 1);
    assert.deepEqual(faulty.diagnostics.map(({ message }) => message), ["Error: start failed", "Error: close failed"]);
    const stopping = progressObserver(() => ({ pause() { throw new UserCanceled(); } }));
    stopping.pause();
    assert.equal(stopping.stopped(), true);
    const paused = [];
    progressObserver(() => ({ pause: () => paused.push(true) })).pause();
    assert.deepEqual(paused, [true]);
});

test("nothing is drawn before the first progress, nor once Stop is asked", () => {
    const reports = [];
    let stopping = false;
    const observer = progressObserver(() => ({
        start: () => undefined,
        report(...fields) { reports.push(fields); if (stopping) { throw new UserCanceled(); } }
    }));
    observer.stopped();
    observer.progress({ type: "progress", done: 0, total: 2 });
    observer.stopped();
    assert.deepEqual(reports, [], "a progress without a phase has nothing to say");
    observer.progress({ type: "phase", phase: "Reading" });
    observer.progress({ type: "progress", done: 1, total: 2 });
    stopping = true;
    assert.equal(observer.stopped(), true);
    assert.equal(observer.stopped(), true);
    assert.deepEqual(reports, [[1, "Reading", ""]]);
});
