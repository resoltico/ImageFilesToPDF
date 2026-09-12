"use strict";

/*
 * What an interactive run says while it is running, and when it stops saying
 * it.
 *
 * Observed through the host's own Progress object, which is one of the two
 * surfaces a report is written to; the other is an AppKit panel that nothing
 * headless can see. The dialogs are recorded in the same list, because half
 * of what matters here is the order things happened in.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { run, execute } = require("../../../src/runtime/main.js");
const { createFakeHost } = require("./fake-host.cjs");

globalThis.Path = (item) => String(item);
globalThis.Application = () => ({ selection: () => [] });

function interactiveHost() {
    return createFakeHost({ files: ["/a/x.png"] });
}

/*
 * Every assignment as it happens, with the dialogs in the same list. The
 * host's Progress object holds only the last value written to each property,
 * and what matters here is the order things happened in.
 */
function watchProgress(host) {
    const seen = [];
    const reported = {};
    const properties = [
        "totalUnitCount",
        "completedUnitCount",
        "description",
        "additionalDescription"
    ];

    for (const key of properties) {
        const cell = {};

        Object.defineProperty(reported, key, {
            get: () => cell.value,
            set: (value) => {
                cell.value = value;
                seen.push(`${key}=${value}`);
            }
        });
    }

    const { displayDialog } = host;

    host.displayDialog = (message, options) => {
        seen.push("dialog");

        return displayDialog.call(host, message, options);
    };
    globalThis.Progress = reported;

    return seen;
}

test("an interactive run tells the host how much work there is", () => {
    // Written to the host's own Progress object. A combined run of one image
    // has two units of work in it -- the image, and the PDF it becomes -- and
    // the label beside them still counts images.
    const host = interactiveHost();
    const seen = watchProgress(host);

    try {
        execute(host, ["/a/x.png"], false);
    } finally {
        delete globalThis.Progress;
    }

    assert.ok(seen.includes("totalUnitCount=2"), "the image and the PDF");
    assert.ok(seen.includes("completedUnitCount=2"), "and all of it is finished");
    assert.ok(seen.includes("additionalDescription=1 of 1 — x.png"));
});

test("the report is over before the completion dialog is shown", () => {
    // A panel at the floating window level sits above a dialog, so a report
    // still on screen when the answer arrives is a report in front of it.
    // Clearing the host's total is what closing looks like from out here.
    const host = interactiveHost();
    const seen = watchProgress(host);

    try {
        execute(host, ["/a/x.png"], false);
    } finally {
        delete globalThis.Progress;
    }

    assert.ok(seen.includes("totalUnitCount=0"), "the report was closed at all");
    assert.ok(
        seen.lastIndexOf("totalUnitCount=0") < seen.lastIndexOf("dialog"),
        `closed before the last dialog: ${seen.join(", ")}`
    );
});

test("a run that fails closes the report before the error dialog", () => {
    // The guard around the run, rather than the run itself: whatever happens
    // in there, the report is closed before the message about it.
    const host = createFakeHost({ files: ["/a/x.png"], executables: [] });
    const seen = watchProgress(host);

    globalThis.Application.currentApplication = () => host;

    try {
        assert.deepEqual(run(["/a/x.png"], undefined), []);
    } finally {
        delete globalThis.Progress;
    }

    assert.ok(seen.includes("description=Checking required tools"));
    assert.ok(seen.includes("totalUnitCount=0"), "the report was closed at all");
    assert.equal(seen.at(-1), "dialog", "and the failure is the last thing said");
    assert.ok(seen.lastIndexOf("totalUnitCount=0") < seen.lastIndexOf("dialog"));
});

test("the run says what it is doing before it has anything to count", () => {
    // The tools are probed and the folders are walked before there is a
    // total, and a walk of a large folder is the longest a run can go
    // without saying anything.
    const host = interactiveHost();
    const seen = watchProgress(host);

    try {
        execute(host, ["/a/x.png"], false);
    } finally {
        delete globalThis.Progress;
    }

    assert.deepEqual(seen.slice(0, 2), [
        "completedUnitCount=0",
        "description=Checking required tools"
    ]);
    assert.ok(seen.includes("description=Finding images"));
});
