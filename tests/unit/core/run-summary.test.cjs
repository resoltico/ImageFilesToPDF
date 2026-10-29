"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { summarizeRun } = require("../../../src/core/run-summary.js");
const { runOutcome } = require("../../../src/core/outcomes.js");
const saved = (output = "/out/a.pdf") => ({ state: "saved", sources: ["/a.png"], pages: 1, issues: [], output });

test("consented refusals do not change a fully saved GUI headline", () => {
    const rejected = [{ path: "/bad.gif", reason: "unsupported" }];
    const outcome = runOutcome([saved(), saved("/out/b.pdf"), saved("/other/c.pdf")], rejected);
    const summary = summarizeRun(outcome);
    assert.equal(outcome.state, "incomplete");
    assert.equal(summary.kind, "all-saved");
    assert.deepEqual(summary.counts, { saved: 3, recovered: 0, failed: 0, cancelled: 0, "not-started": 0 });
    assert.deepEqual(summary.saved, [
        { folder: "/out/", outputs: [{ path: "/out/a.pdf", name: "a.pdf", sources: ["/a.png"] }, { path: "/out/b.pdf", name: "b.pdf", sources: ["/a.png"] }] },
        { folder: "/other/", outputs: [{ path: "/other/c.pdf", name: "c.pdf", sources: ["/a.png"] }] }
    ]);
    assert.deepEqual(summary.refusals, rejected);
});

test("summary distinguishes invalid, empty, stopped, failed and partially saved runs", () => {
    assert.equal(summarizeRun({ ...runOutcome(), state: "invalid" }).kind, "invalid");
    assert.equal(summarizeRun(runOutcome()).kind, "nothing-to-convert");
    const failed = { state: "failed", sources: ["/first.png", "/bad.png"], issues: [{ source: "/bad.png", message: "damaged" }] };
    const recovered = { state: "recovered", sources: ["/kept.png"], recovery: "/Downloads/kept.pdf", issues: [{ message: "destination unavailable" }] };
    const summary = summarizeRun(runOutcome([saved(), failed, recovered], [], [{ message: "run fault" }, { source: "/run.png", message: "named fault" }]));
    assert.equal(summary.kind, "some-saved");
    assert.deepEqual(summary.failures, [{ source: "/bad.png", message: "damaged" }, { source: "/kept.png", message: "destination unavailable" }, { source: "", message: "run fault" }, { source: "/run.png", message: "named fault" }]);
    assert.deepEqual(summary.recoveries, [{ location: "/Downloads/kept.pdf", sources: ["/kept.png"] }]);
    assert.equal(summarizeRun(runOutcome([failed])).kind, "none-saved");
    assert.equal(summarizeRun(runOutcome([{ ...saved(), issues: [{ message: "saved reporting fault" }] }])).kind, "some-saved");
    const stopped = summarizeRun(runOutcome([saved(), { state: "cancelled", sources: ["/stop.png"], issues: [{ code: "cancelled" }] }, { state: "not-started", sources: ["/later.png"], issues: [] }], [], [{ code: "cancelled" }, { code: "no-images" }]));
    assert.equal(stopped.kind, "stopped");
    assert.equal(stopped.notStarted, 1);
    assert.deepEqual(stopped.failures, []);
});

test("an aborted run with unattempted documents is summarized as stopped", () => {
    const summary = summarizeRun(runOutcome([saved(), { state: "not-started", sources: ["/later.png"], issues: [] }]));
    assert.equal(summary.kind, "stopped");
    assert.equal(summary.notStarted, 1);
});
