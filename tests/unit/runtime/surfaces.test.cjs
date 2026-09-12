"use strict";

/*
 * Where a report is displayed, and how a run acquires somewhere to display it.
 *
 * The action used to write to one surface and assume it was seen. JavaScript
 * for Automation's Progress object is presented by Script Editor, by an applet
 * and by the system script menu; this action ships as a Shortcut, which is
 * none of those, so the assignments succeeded and nobody saw anything.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { jxaProgress, openProgress } = require("../../../src/runtime/surfaces.js");
const { SILENT } = require("../../../src/runtime/progress.js");

test("the host's own object is written to, in its own words", () => {
    const host = {};
    const sink = jxaProgress(host);

    sink.start(4);
    sink.report(2, "Preparing", "3 of 4 — x.png");

    assert.deepEqual(host, {
        totalUnitCount: 4,
        completedUnitCount: 2,
        description: "Preparing",
        additionalDescription: "3 of 4 — x.png"
    });
});

test("a finished run stops claiming there is work outstanding", () => {
    // A bar left part-filled after the run is over goes on saying so. Zero is
    // what hides it.
    const host = { totalUnitCount: 4, completedUnitCount: 2 };
    const sink = jxaProgress(host);

    sink.pause();
    assert.equal(host.totalUnitCount, 4, "a pause is not an ending");

    sink.close();
    assert.equal(host.totalUnitCount, 0);
});

test("no Progress on the host is no surface", () => {
    assert.equal(jxaProgress(null), null);
    assert.equal(jxaProgress(undefined), null);
});

test("a headless run builds nothing and reports nothing", () => {
    // No AppKit, no activation policy, nothing to tear down: a caller reading
    // a receipt is not looking at a window.
    let built = 0;

    assert.equal(openProgress(true, [() => {
        built += 1;

        return {};
    }]), SILENT);
    assert.equal(built, 0);
});

test("the surfaces that can be established are the ones written to", () => {
    const said = [];
    const surface = (name) => () => ({
        start: () => said.push(`${name} start`),
        report: () => said.push(`${name} report`),
        pause: () => undefined,
        close: () => undefined
    });
    const progress = openProgress(false, [
        surface("panel"),
        () => null,
        surface("host")
    ]);

    progress.expect({ units: 1, images: 1 });
    progress.phase("Saving PDF");

    assert.deepEqual(said, [
        "panel start",
        "host start",
        "panel report",
        "host report"
    ]);
});

test("with no surface at all there is nothing to report to", () => {
    // Which is now something measured about the host rather than something
    // assumed about it: both surfaces were asked, and both refused.
    assert.equal(openProgress(false, [() => null, () => null]), SILENT);
});

test("a surface that throws on the way up is a run with no progress, not a failure", () => {
    // openProgress is called before the try that turns an error into a
    // dialog, so it is the one thing here that cannot throw at all.
    assert.equal(openProgress(false, [() => {
        throw new Error("no window server");
    }]), SILENT);
});

test("the default surfaces are the panel and the host's own object", () => {
    // Under Node there is no ObjC bridge and no Progress, so both refuse and
    // the run is silent -- which is also what a machine with no window server
    // does, and it converts exactly the same either way.
    assert.equal(openProgress(false), SILENT);

    globalThis.Progress = {};

    try {
        assert.notEqual(openProgress(false), SILENT, "the host's object is found");
    } finally {
        delete globalThis.Progress;
    }
});
