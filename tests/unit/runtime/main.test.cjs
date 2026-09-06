"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { execute } = require("../../../src/runtime/main.js");
const { createFakeHost } = require("./fake-host.cjs");

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

const SEPARATE_CONFIG = JSON.stringify({
    paperSize: "Letter",
    orientation: "Landscape",
    dpi: 72,
    quality: 85,
    mode: "Separate PDFs",
    background: "#8E79E0",
    timestamp: "20260904_010203"
});

const ARGS = ["--", "--headless", "/tmp/c.json", "/a/x.png"];

test("a headless run returns JSON describing what it produced", () => {
    const host = headlessHost();
    const result = JSON.parse(execute(host, ARGS, true));

    assert.deepEqual(result.outputs, ["/a/output_20260904_010203.pdf"]);
    assert.deepEqual(result.failures, []);
    assert.match(result.elapsed, /second\(s\)/u);
});

test("a headless run in separate mode reports each file it produced", () => {
    // The mode the integration suite exercises, and the other half of the
    // branch that chooses which builder to run.
    const host = headlessHost();
    const inner = host.doShellScript;

    host.doShellScript = (command) => (command.includes("/bin/cat")
        ? SEPARATE_CONFIG
        : inner(command));

    const result = JSON.parse(execute(host, ARGS, true));

    assert.deepEqual(result.failures, []);
    assert.equal(result.outputs.length, 1);
    assert.match(result.outputs[0], /x_20260904_010203\.pdf$/u);
});

test("a headless run cleans up its workspace", () => {
    const host = headlessHost();

    execute(host, ARGS, true);
    assert.ok(
        host.commands.some((command) => command.includes("/bin/rm") && command.includes("-rf")),
        "the temporary workspace must be removed"
    );
});

test("a headless run with no usable images throws", () => {
    const host = headlessHost({ files: [] });

    assert.throws(
        () => execute(host, ["--", "--headless", "/tmp/c.json", "/a/x.png"], true),
        /No image files were supplied/u
    );
});

test("an interactive run with no images explains itself in a dialog", () => {
    const host = createFakeHost({ files: [] });

    assert.deepEqual(execute(host, [], false), []);
    assert.match(host.dialogs.at(-1).message, /No images selected/u);
    assert.match(host.dialogs.at(-1).message, /run the action again/u);

    // A notice, not a question: the default button set would give it a
    // Cancel there is nothing to cancel, and an untitled dialog does not say
    // which action it came from.
    assert.deepEqual(host.dialogs.at(-1).options, {
        withTitle: "Image Files to PDF",
        buttons: ["OK"],
        defaultButton: "OK"
    });
});

test("elapsed time is measured from the start of the run", () => {
    const host = headlessHost();
    const result = JSON.parse(execute(host, ARGS, true));

    // A sign error here would still produce a plausible-looking string, so
    // the value is checked rather than only its shape.
    assert.match(result.elapsed, /^\d+ second\(s\)$/u);
    assert.ok(
        Number(result.elapsed.split(" ")[0]) < 60,
        `a local run should not take minutes: ${result.elapsed}`
    );
});
