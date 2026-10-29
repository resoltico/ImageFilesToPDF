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
const { openProgress } = require("../../../src/host/surfaces.js");

function reportsNowhere(progress) {
    // A reporter with no surfaces: every verb is accepted and nothing can
    // ever ask it to stop, because nothing is listening to ask.
    progress.expect({ units: 1, images: 1 });
    progress.beginning(1, "x.png");
    progress.about("1 image prepared");
    progress.phase("Saving PDF");
    progress.finished("Saved");
    progress.pause();
    progress.close();

    return true;
}

test("a headless run builds nothing and reports nothing", () => {
    // No AppKit, no activation policy, nothing to tear down: a caller reading
    // a receipt is not looking at a window.
    let built = 0;

    const progress = openProgress(true, [() => {
        built += 1;

        return {};
    }]);

    assert.equal(built, 0);
    assert.ok(reportsNowhere(progress));
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
    assert.ok(reportsNowhere(openProgress(false, [() => null, () => null])));
});

test("a surface that throws on the way up is a run with no progress, not a failure", () => {
    // openProgress is called before the try that turns an error into a
    // dialog, so it is the one thing here that cannot throw at all.
    assert.ok(reportsNowhere(openProgress(false, [() => {
        throw new Error("no window server");
    }])));
});

test("the default surfaces are the panel and the host's own object", () => {
    // Under Node there is no ObjC bridge and no Progress, so both refuse and
    // the run is silent -- which is also what a machine with no window server
    // does, and it converts exactly the same either way.
    assert.ok(reportsNowhere(openProgress(false)));

    const reported = {};

    globalThis.Progress = reported;

    try {
        openProgress(false).phase("Preparing");
        assert.deepEqual(reported, {}, "host Progress is never written");
    } finally {
        delete globalThis.Progress;
    }
});
