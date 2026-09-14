"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { run, execute } = require("../../../src/runtime/main.js");
const { createFakeHost } = require("./fake-host.cjs");

globalThis.Path = (item) => String(item);
globalThis.Application = () => ({ selection: () => [] });

// What a run actually produced, asked of the filesystem rather than of the
// return value: a person is answered with nothing, because a Quick Action's
// result is the shortcut's result and Shortcuts writes one out as a file.
function pdfsIn(host) {
    return [...host.files].filter((file) => file.endsWith(".pdf"));
}

function interactiveHost() {
    return createFakeHost({
        files: ["/a/x.png"],
        executables: [
            "/opt/homebrew/bin/vips",
            "/opt/homebrew/bin/vipsheader",
            "/opt/homebrew/bin/pdfcpu"
        ]
    });
}

test("an interactive run reports completion in a dialog", () => {
    const host = interactiveHost();

    // The fake picks the first item of every list, and the first output
    // option is now the common case: one PDF with all the images.
    assert.equal(execute(host, ["/a/x.png"], false), undefined);
    assert.equal(pdfsIn(host).length, 1);
    assert.match(host.dialogs.at(-1).message, /Created one PDF/u);
    assert.match(host.dialogs.at(-1).message, /\/a\/output_/u);
});

test("an interactive run in single mode names the file it produced", () => {
    const host = interactiveHost();

    host.nextChoice = undefined;
    const { chooseFromList } = host;

    host.chooseFromList = (choices) => (choices.includes("Single PDF")
        ? ["Single PDF"]
        : chooseFromList(choices));

    assert.equal(execute(host, ["/a/x.png"], false), undefined);
    assert.equal(pdfsIn(host).length, 1);
    assert.match(host.dialogs.at(-1).message, /Created one PDF/u);
    assert.match(host.dialogs.at(-1).message, /\/a\/output_/u);
});

test("run answers a person with nothing, and the PDF is where it says", () => {
    // The list of PDFs used to come back here, and a Quick Action's result is
    // the shortcut's result: Shortcuts wrote each path out as a file of its
    // own, named after the path with the slashes turned into colons, beside
    // the images. The dialog is how a person is told; there is nothing left
    // to hand back.
    const host = interactiveHost();

    globalThis.Application.currentApplication = () => host;

    assert.equal(run(["/a/x.png"], undefined), undefined);
    assert.equal(pdfsIn(host).length, 1, "the PDF was made all the same");
    assert.equal(host.includeStandardAdditions, true);
});
