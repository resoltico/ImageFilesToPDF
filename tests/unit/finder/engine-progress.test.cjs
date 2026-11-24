"use strict";
const { inspectModule } = require("../ports/inspect-module.cjs");

const assert = require("node:assert/strict");
const test = require("node:test");
const { progressObserver } = inspectModule(require.resolve("../../../src/finder/quick-action/main.js"), ["progressObserver"]);

test("Finder pairs phase and progress frames before rendering the panel", () => {
    const events = [];
    const observer = progressObserver(() => ({
        start: (total) => events.push(["start", total]),
        report: (...fields) => events.push(fields)
    }));

    observer.progress({ type: "phase", phase: "Preparing" });
    observer.progress({ type: "progress", done: 0, total: 4, current: "1 of 3 — first.png" });
    assert.equal(observer.stopped(), false);

    observer.progress({ type: "phase", phase: "Creating PDF" });
    observer.stopped();
    observer.progress({ type: "progress", done: 3, total: 4 });
    observer.stopped();

    assert.deepEqual(events, [
        ["start", 4],
        [0, "Preparing", "1 of 3 — first.png"],
        [0, "Preparing", "1 of 3 — first.png"],
        [3, "Creating PDF", ""]
    ]);
});

test("Finder records panel factory failures and continues accepting engine progress", () => {
    for (const fault of [new TypeError("broken factory"), null]) {
        const observer = progressObserver(() => {
            throw fault;
        });
        observer.progress({ type: "phase", phase: "Preparing" });
        observer.progress({ type: "progress", done: 0, total: 1 });
        assert.equal(observer.stopped(), false);
        observer.close();
        assert.deepEqual(observer.diagnostics, [{ code: "observer-fault", message: String(fault), stack: fault?.stack ?? "" }]);
    }
});
