"use strict";

/*
 * Saying what the run is doing while it does it, written to JavaScript for
 * Automation's own Progress object rather than to a window this code puts on
 * screen. If nothing is listening, nothing happens -- which is the whole
 * reason it was chosen over a panel that could put a Dock icon up mid-action.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    createProgress,
    jxaProgress,
    SILENT
} = require("../../../src/runtime/progress.js");

function recorder() {
    const said = [];

    return {
        said,
        start: (total) => said.push(`start ${total}`),
        report: (done, description, detail) =>
            said.push(`${description} ${done} | ${detail}`)
    };
}

test("nothing is complete until something has finished", () => {
    // completedUnitCount holds work that is done. It used to hold the number
    // of the file about to be started, so a job of one image reported itself
    // complete before its first inspection had even run.
    const sink = recorder();
    const progress = createProgress({ units: 3, images: 3 }, sink);

    progress.beginning(1, "one.png");
    progress.finished("Saved");
    progress.beginning(2, "two.png");

    assert.deepEqual(sink.said, [
        "start 3",
        "Preparing 0 | 1 of 3 — one.png",
        "Saved 1 | 1 of 3 — one.png",
        "Preparing 1 | 2 of 3 — two.png"
    ]);
});

test("the label says which file, the count says how much is done", () => {
    // Two different things, reported together. The label may say the third of
    // twenty while two are finished.
    const sink = recorder();
    const progress = createProgress({ units: 20, images: 20 }, sink);

    progress.beginning(1, "a.png");
    progress.finished("Saved");
    progress.beginning(2, "b.png");
    progress.finished("Saved");
    progress.beginning(3, "c.png");

    assert.equal(sink.said.at(-1), "Preparing 2 | 3 of 20 — c.png");
});

test("the later stages keep the file they are working on", () => {
    const sink = recorder();
    const progress = createProgress({ units: 2, images: 2 }, sink);

    progress.beginning(2, "last.png");
    progress.phase("Creating PDF");
    progress.phase("Validating PDF");

    assert.deepEqual(sink.said.slice(-2), [
        "Creating PDF 0 | 2 of 2 — last.png",
        "Validating PDF 0 | 2 of 2 — last.png"
    ]);
});

test("a name that spans lines is kept to one", () => {
    const sink = recorder();

    createProgress({ units: 1, images: 1 }, sink).beginning(1, "two\nwide\t\tlines .png");
    assert.deepEqual(sink.said.at(-1), "Preparing 0 | 1 of 1 — two wide lines .png");
});

test("a stage reached before any file names no file", () => {
    const sink = recorder();

    createProgress({ units: 2, images: 2 }, sink).phase("Creating PDF");
    assert.deepEqual(sink.said.at(-1), "Creating PDF 0 | ");
});

test("a report about the work does not become part of the work", () => {
    // A host that refuses the assignment must not fail the conversion.
    const angry = {
        start: () => undefined,
        report() {
            throw new Error("no progress here");
        }
    };

    assert.doesNotThrow(() => createProgress({ units: 1, images: 1 }, angry).beginning(1, "x.png"));
});

test("a host that will not start is reported to no further", () => {
    const refuses = {
        start() {
            throw new Error("no progress here");
        },
        report: () => undefined
    };

    assert.equal(createProgress({ units: 1, images: 1 }, refuses), SILENT);
});

test("with nothing to report to, nothing is reported", () => {
    assert.equal(createProgress({ units: 5, images: 5 }, null), SILENT);
    assert.equal(jxaProgress(null), null, "no Progress on the host");
    assert.doesNotThrow(() => {
        SILENT.beginning(1, "x.png");
        SILENT.finished("Saved");
        SILENT.phase("Saving PDF");
    });
});

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
