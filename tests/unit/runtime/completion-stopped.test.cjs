"use strict";

/*
 * What a run says when it was asked to stop.
 *
 * Only a separate run can reach this. It publishes as it goes, so stopping
 * leaves real PDFs on disk, and saying nothing about them is the one thing
 * this dialog exists to prevent. A combined run that stops has produced
 * nothing and ends in silence, like every other cancellation in this action.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    completionMessage
} = require("../../../src/runtime/completion.js");

test("a run that was asked to stop says so, and what it did not reach", () => {
    // Only a separate run can reach this: it publishes as it goes, so
    // stopping leaves real PDFs on disk and saying nothing about them is the
    // one thing this dialog exists to prevent.
    const message = completionMessage("separate", {
        outputs: ["/a/1.pdf", "/a/2.pdf"],
        failures: [],
        elapsed: "3 second(s)",
        rejected: [],
        stopped: true
    }, 20);

    assert.match(message, /Created 2 PDFs\./u);
    assert.match(message, /Stopped\. 18 images not started\./u);
});

test("a stopped run counts what it tried, not only what it saved", () => {
    // An image that failed was started. Counting only the successes would say
    // more was left untouched than really was.
    const message = completionMessage("separate", {
        outputs: ["/a/1.pdf"],
        failures: [{ name: "b.png", message: "broke" }],
        elapsed: "3 second(s)",
        rejected: [],
        stopped: true
    }, 20);

    assert.match(message, /Stopped\. 18 images not started\./u);
    assert.match(message, /Finished with errors\./u);
});

test("a run nobody stopped says nothing about stopping", () => {
    for (const mode of ["single", "separate"]) {
        const message = completionMessage(mode, {
            outputs: ["/a/1.pdf"],
            failures: [],
            elapsed: "1 second(s)",
            rejected: []
        }, 1);

        assert.ok(!message.includes("Stopped"), mode);
    }
});

test("a stop with one image left says image, not images", () => {
    const message = completionMessage("separate", {
        outputs: ["/a/1.pdf"],
        failures: [],
        elapsed: "1 second(s)",
        rejected: [],
        stopped: true
    }, 2);

    assert.match(message, /Stopped\. 1 image not started\./u);
});
