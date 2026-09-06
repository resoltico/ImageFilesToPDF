"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { run } = require("../../../src/runtime/main.js");
const { createFakeHost } = require("./fake-host.cjs");
const { failing } = require("./fake-app.cjs");

const CONFIG = JSON.stringify({
    paperSize: "A4",
    orientation: "Portrait",
    dpi: 72,
    quality: 85,
    mode: "Single PDF",
    background: "#FFFFFF",
    timestamp: "20260904_010203"
});

globalThis.Path = (item) => String(item);
globalThis.Application = () => ({ selection: () => [] });

function headlessHost(extra = {}) {
    const host = createFakeHost({
        files: ["/a/x.png"],
        executables: [
            "/opt/homebrew/bin/vips",
            "/opt/homebrew/bin/vipsheader",
            "/opt/homebrew/bin/pdfcpu"
        ],
        ...extra
    });
    const inner = host.doShellScript;

    host.doShellScript = (command) => (command.includes("/bin/cat")
        ? CONFIG
        : inner(command));

    return host;
}

const ARGS = ["--", "--headless", "/tmp/c.json", "/a/x.png"];

test("run reports a failure through a dialog when interactive", () => {
    // An image is needed to reach the settings dialogs at all: the checks
    // that run first would otherwise return before anything is asked.
    const host = createFakeHost({ files: ["/a/x.png"] });

    host.chooseFromList = () => {
        throw failing("something broke");
    };
    globalThis.Application.currentApplication = () => host;

    assert.deepEqual(run(["/a/x.png"], undefined), []);
    assert.match(host.dialogs.at(-1).message, /^something broke$/u);

    // Titled, and with the one button a report of failure can offer.
    assert.deepEqual(host.dialogs.at(-1).options, {
        withTitle: "Image Files to PDF",
        buttons: ["OK"],
        defaultButton: "OK"
    });
});

test("run rethrows in headless mode instead of showing a dialog", () => {
    const host = headlessHost({ files: [] });

    globalThis.Application.currentApplication = () => host;
    assert.throws(() => run(ARGS, undefined), /No image files were supplied/u);
});

test("run stays silent when the user cancels", () => {
    // An image is required to reach the settings dialogs at all; with none,
    // the run returns before anything could be cancelled.
    const host = createFakeHost({ files: ["/a/x.png"] });

    host.chooseFromList = () => false;
    globalThis.Application.currentApplication = () => host;

    assert.deepEqual(run(["/a/x.png"], undefined), []);
    assert.equal(
        host.dialogs.length,
        0,
        "a cancellation must not raise any dialog"
    );
});

test("a genuine failure does raise a dialog, unlike a cancellation", () => {
    // The contrast is the point: without it, "no dialog" would pass whether
    // or not the cancellation check worked.
    const host = createFakeHost({ files: ["/a/x.png"] });

    host.chooseFromList = () => {
        throw new Error("the tool exploded");
    };
    globalThis.Application.currentApplication = () => host;

    assert.deepEqual(run(["/a/x.png"], undefined), []);
    assert.equal(host.dialogs.length, 1);
    assert.match(host.dialogs[0].message, /the tool exploded/u);
});
