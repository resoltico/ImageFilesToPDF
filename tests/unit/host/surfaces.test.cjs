"use strict";

// Progress factory behavior at the port; native suites establish actual UI.

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
    // Injected factories can all report that their observers are unavailable.
    assert.ok(reportsNowhere(openProgress(false, [() => null, () => null])));
});

test("a surface that throws on the way up is a run with no progress, not a failure", () => {
    // openProgress is called before the try that turns an error into a
    // dialog, so it is the one thing here that cannot throw at all.
    assert.ok(reportsNowhere(openProgress(false, [() => {
        throw new Error("no window server");
    }])));
});

test("the custom panel is the only default surface and host Progress is untouched", () => {
    // Without an ObjC bridge the custom panel is unavailable. A supplied
    // host Progress object still receives no writes.
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
