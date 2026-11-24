"use strict";

/*
 * Saying what the run is doing while it does it: the counting and the wording.
 * Where any of it is displayed is surfaces.js and panel.js; nothing here knows
 * about either, which is the point of the split.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { createProgress } = require("../../../src/application/progress.js");

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
        "Saved 1 | ",
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

test("a document phase clears the last image and completion reports no current image", () => {
    const sink = recorder();
    const progress = opened(sink, 3, 2);
    progress.beginning(2, "last.png");
    progress.phase("Creating PDF");
    progress.finished("Saved");
    assert.deepEqual(sink.said.slice(-3), ["Preparing 0 | 2 of 2 — last.png", "Creating PDF 0 | ", "Saved 1 | "]);
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

test("inspection counts reset before conversion work begins", () => {
    const events = [];
    const progress = createProgress([{ start: (count) => events.push(["total", count]), report: (done, text, detail) => events.push([done, text, detail]), pause: () => undefined, close: () => undefined }]);
    progress.expect({ units: 2, images: 2 });
    progress.checking(2, 2);
    progress.pause();
    progress.expect({ units: 3, images: 2 });
    progress.beginning(1, "a.png");
    assert.ok(events.some((entry) => entry[0] === 2 && entry[1] === "Checking images" && entry[2] === "2 of 2"));
    assert.deepEqual(events.at(-1), [0, "Preparing", "1 of 2 — a.png"]);
});
