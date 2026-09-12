"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { run, execute } = require("../../../src/runtime/main.js");
const { createFakeHost } = require("./fake-host.cjs");

globalThis.Path = (item) => String(item);
globalThis.Application = () => ({ selection: () => [] });

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
    const outputs = execute(host, ["/a/x.png"], false);

    // The fake picks the first item of every list, and the first output
    // option is now the common case: one PDF with all the images.
    assert.equal(outputs.length, 1);
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

    const outputs = execute(host, ["/a/x.png"], false);

    assert.equal(outputs.length, 1);
    assert.match(host.dialogs.at(-1).message, /Created one PDF/u);
    assert.match(host.dialogs.at(-1).message, /\/a\/output_/u);
});

test("run returns the produced paths on the interactive path", () => {
    const host = interactiveHost();

    globalThis.Application.currentApplication = () => host;
    const outputs = run(["/a/x.png"], undefined);

    assert.equal(outputs.length, 1);
    assert.equal(host.includeStandardAdditions, true);
});
