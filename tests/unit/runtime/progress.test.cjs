"use strict";

/*
 * Saying what the run is doing while it does it: the counting and the wording.
 * Where any of it is displayed is surfaces.js and panel.js; nothing here knows
 * about either, which is the point of the split.
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

function opened(sink, units = 3, images = 3) {
    const progress = createProgress([sink]);

    progress.expect({ units, images });

    return progress;
}

test("nothing is complete until something has finished", () => {
    // completedUnitCount holds work that is done. It used to hold the number
    // of the file about to be started, so a job of one image reported itself
    // complete before its first inspection had even run.
    const sink = recorder();
    const progress = opened(sink);

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
    const progress = opened(sink, 20, 20);

    progress.beginning(1, "a.png");
    progress.finished("Saved");
    progress.beginning(2, "b.png");
    progress.finished("Saved");
    progress.beginning(3, "c.png");

    assert.equal(sink.said.at(-1), "Preparing 2 | 3 of 20 — c.png");
});

test("the later stages keep the file they are working on", () => {
    const sink = recorder();
    const progress = opened(sink, 2, 2);

    progress.beginning(2, "last.png");
    progress.phase("Creating PDF");
    progress.phase("Validating PDF");

    assert.deepEqual(sink.said.slice(-2), [
        "Creating PDF 0 | 2 of 2 — last.png",
        "Validating PDF 0 | 2 of 2 — last.png"
    ]);
});

test("a stage that is not about an image says so instead of naming one", () => {
    // The last stages of a combined run are about the PDF. They used to be
    // reported beside whichever image happened to be prepared last, so a run
    // of twenty read "Validating PDF / 20 of 20 — last.png".
    const sink = recorder();
    const progress = opened(sink, 3, 2);

    progress.beginning(2, "last.png");
    progress.about("2 images prepared");
    progress.phase("Creating PDF");

    assert.deepEqual(sink.said.slice(-2), [
        "Preparing 0 | 2 images prepared",
        "Creating PDF 0 | 2 images prepared"
    ]);
});

test("a summary before any stage invents no stage to put it under", () => {
    // The detail line and the headline are two separate things, and setting
    // one must not make the other up.
    const sink = recorder();
    const progress = createProgress([sink]);

    progress.about("1 image prepared");

    assert.deepEqual(sink.said, [" 0 | 1 image prepared"]);
});

test("a name that spans lines is kept to one", () => {
    const sink = recorder();

    opened(sink, 1, 1).beginning(1, "two\nwide\t\tlines .png");
    assert.equal(sink.said.at(-1), "Preparing 0 | 1 of 1 — two wide lines .png");
});

test("a stage reached before any file names no file", () => {
    // Which is every stage before the images have even been counted: the
    // tools are checked and the folders are read before there is a total.
    const sink = recorder();
    const progress = createProgress([sink]);

    progress.phase("Checking required tools");

    assert.deepEqual(sink.said, ["Checking required tools 0 | "]);
});
