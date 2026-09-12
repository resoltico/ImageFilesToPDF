"use strict";

/*
 * When a run says things, and when it stops.
 *
 * Driven through a report that records instead of displaying, because the
 * order is the whole of what matters here: the preparation has to be covered,
 * the report has to be out of the way before a question is asked, and it has
 * to be closed before anything is displayed. A panel at the floating window
 * level sits above a dialog, so a report still up when the completion message
 * arrives is a report in front of the answer.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { execute } = require("../../../src/runtime/main.js");
const { createFakeHost } = require("./fake-host.cjs");

globalThis.Path = (item) => String(item);
globalThis.Application = () => ({ selection: () => [] });

function recordingReport(done) {
    return {
        stopped: () => false,
        expect: ({ units, images }) => done.push(`expect ${units}/${images}`),
        beginning: (index, name) => done.push(`beginning ${index} ${name}`),
        about: (summary) => done.push(`about ${summary}`),
        phase: (text) => done.push(`phase ${text}`),
        finished: (text) => done.push(`finished ${text}`),
        pause: () => done.push("pause"),
        close: () => done.push("close")
    };
}

function runWith(files) {
    const host = createFakeHost({ files });
    const done = [];

    host.displayDialog = () => {
        done.push("dialog");

        return { textReturned: "92" };
    };
    host.chooseFromList = (choices) => {
        done.push("asked");

        return [choices[0]];
    };
    execute(host, files, false, recordingReport(done));

    return done;
}

test("the preparation is covered before anything can be counted", () => {
    // The tools are probed and the folders are walked before there is a
    // total, and a walk of a large folder is the longest a run can go without
    // saying anything.
    const done = runWith(["/a/x.png"]);

    assert.deepEqual(done.slice(0, 2), [
        "phase Checking required tools",
        "phase Finding images"
    ]);
});

test("the report is out of the way before the settings are asked", () => {
    const done = runWith(["/a/x.png"]);

    assert.ok(
        done.indexOf("pause") < done.indexOf("asked"),
        `paused before the first question: ${done.join(", ")}`
    );
    assert.ok(
        done.indexOf("asked") < done.indexOf("expect 2/1"),
        "and the total is only known once they are answered"
    );
});

test("the report is closed before the completion dialog", () => {
    const done = runWith(["/a/x.png"]);

    assert.deepEqual(done.slice(-2), ["close", "dialog"]);
});

test("a run with nothing to convert closes before it says so", () => {
    // The panel may well be up by then: finding out there is nothing to do
    // means having walked everything that was selected.
    const done = runWith([]);

    assert.deepEqual(done.slice(-2), ["close", "dialog"]);
});

test("a whole run, in order", () => {
    const done = runWith(["/a/x.png"]);

    assert.deepEqual(done, [
        "phase Checking required tools",
        "phase Finding images",
        "pause",
        "asked",
        "asked",
        "dialog",
        "dialog",
        "asked",
        "asked",
        "expect 2/1",
        "beginning 1 x.png",
        "finished Preparing",
        "about 1 image prepared",
        "phase Creating PDF",
        "phase Validating PDF",
        "phase Saving PDF",
        "finished Saved",
        "close",
        "dialog"
    ]);
});
