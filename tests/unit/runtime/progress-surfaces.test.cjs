"use strict";

/*
 * Reporting to more than one surface, and to none.
 *
 * They are not alternatives falling back on one another: the host's own
 * Progress object is presented by Script Editor and by an applet, an AppKit
 * panel is what a Shortcut can show, and a run may be either. So every
 * surface gets every report, and one that refuses does not stop the others.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { createProgress } = require("../../../src/runtime/progress.js");

function recorder() {
    const said = [];

    return {
        said,
        start: (total) => said.push(`start ${total}`),
        report: (done, description, detail) =>
            said.push(`${description} ${done} | ${detail}`),
        pause: () => said.push("pause"),
        close: () => said.push("close")
    };
}

test("a report about the work does not become part of the work", () => {
    // A surface that refuses an assignment must not fail the conversion, and
    // must not stop the other surface being told.
    const angry = {
        start: () => undefined,
        report() {
            throw new Error("no progress here");
        }
    };
    const willing = recorder();
    const progress = createProgress([angry, willing]);

    progress.expect({ units: 1, images: 1 });
    assert.doesNotThrow(() => progress.beginning(1, "x.png"));
    assert.deepEqual(willing.said, ["start 1", "Preparing 0 | 1 of 1 — x.png"]);
});

test("with nothing to report to, nothing is reported", () => {
    // A reporter with no surfaces is the only way this action says "nowhere":
    // a headless run, and a job assembled before its count is known. It can
    // never be stopped either, because nothing can tell it to be.
    const silent = createProgress([]);

    assert.doesNotThrow(() => {
        silent.expect({ units: 1, images: 1 });
        silent.beginning(1, "x.png");
        silent.about("1 image prepared");
        silent.finished("Saved");
        silent.phase("Saving PDF");
        silent.pause();
        silent.close();
    });
});

test("a paused report is a report, and a closed one is over", () => {
    // Closing twice is the ordinary case, not an error: the run closes it
    // before the completion dialog and the guard around the run closes it
    // again on the way out.
    const sink = recorder();
    const progress = createProgress([sink]);

    progress.pause();
    progress.close();
    progress.close();

    assert.deepEqual(sink.said, ["pause", "close"]);
});
