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

test("each image is announced as it is prepared", () => {
    const sink = recorder();
    const progress = createProgress(3, sink);

    progress.file(1, "one.png");
    progress.file(2, "two.png");

    assert.deepEqual(sink.said, [
        "start 3",
        "Preparing 1 | 1 of 3 — one.png",
        "Preparing 2 | 2 of 3 — two.png"
    ]);
});

test("the later stages keep the file they are working on", () => {
    const sink = recorder();
    const progress = createProgress(2, sink);

    progress.file(2, "last.png");
    progress.phase("Creating PDF");
    progress.phase("Saving PDF");

    assert.deepEqual(sink.said.slice(-2), [
        "Creating PDF 2 | 2 of 2 — last.png",
        "Saving PDF 2 | 2 of 2 — last.png"
    ]);
});

test("a name that spans lines is kept to one", () => {
    const sink = recorder();

    createProgress(1, sink).file(1, "two\nlines .png");

    assert.deepEqual(sink.said.at(-1), "Preparing 1 | 1 of 1 — two lines .png");
});

test("a stage reached before any file names no file", () => {
    const sink = recorder();

    createProgress(2, sink).phase("Creating PDF");
    assert.deepEqual(sink.said.at(-1), "Creating PDF 0 | 0 of 2 — ");
});

test("a run of whitespace in a name becomes one space", () => {
    const sink = recorder();

    createProgress(1, sink).file(1, "two  wide\t\tgaps.png");
    assert.deepEqual(sink.said.at(-1), "Preparing 1 | 1 of 1 — two wide gaps.png");
});

test("a report about the work does not become part of the work", () => {
    // A host that refuses the assignment must not fail the conversion.
    const angry = {
        start: () => undefined,
        report() {
            throw new Error("no progress here");
        }
    };

    assert.doesNotThrow(() => createProgress(1, angry).file(1, "x.png"));
});

test("a host that will not start is reported to no further", () => {
    const refuses = {
        start() {
            throw new Error("no progress here");
        },
        report: () => undefined
    };

    assert.equal(createProgress(1, refuses), SILENT);
});

test("with nothing to report to, nothing is reported", () => {
    assert.equal(createProgress(5, null), SILENT);
    assert.equal(jxaProgress(null), null, "no Progress on the host");
    assert.doesNotThrow(() => {
        SILENT.file(1, "x.png");
        SILENT.phase("Saving PDF");
    });
});

test("the host's own object is written to, in its own words", () => {
    const host = {};
    const sink = jxaProgress(host);

    sink.start(4);
    sink.report(2, "Preparing", "2 of 4 — x.png");

    assert.deepEqual(host, {
        totalUnitCount: 4,
        completedUnitCount: 2,
        description: "Preparing",
        additionalDescription: "2 of 4 — x.png"
    });
});
