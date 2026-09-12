"use strict";

/*
 * What a headless caller says a run is, and what of it is believed.
 *
 * A configuration file is the whole of what such a run is told, so every
 * value in it is read where it arrives rather than trusted all the way to the
 * filesystem. The timestamp in particular goes straight into an output
 * filename, and a filename is one path component.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    collectInvocation
} = require("../../../src/runtime/input.js");
const { createFakeApp } = require("./fake-app.cjs");

globalThis.Application = () => ({ selection: () => [] });

test("a headless invocation reads its settings from the config file", () => {
    const config = '{"dpi":72,"timestamp":"20260904_010203"}';
    const app = createFakeApp([["/bin/cat", config]]);
    const invocation = collectInvocation(
        app,
        ["--", "--headless", "/tmp/c.json", "/a/1.png", "/a/2.png"],
        true
    );

    assert.equal(invocation.settings.dpi, 72);
    assert.equal(invocation.timestamp, "20260904_010203");
    assert.deepEqual(invocation.inputItems, ["/a/1.png", "/a/2.png"]);
});

test("a headless config without a timestamp yields an empty one", () => {
    const app = createFakeApp([["/bin/cat", '{"dpi":72}']]);
    const invocation = collectInvocation(
        app,
        ["--headless", "/tmp/c.json", "/a/1.png"],
        true
    );

    assert.equal(invocation.timestamp, "");
});

test("a headless timestamp is read rather than taken", () => {
    // It goes straight into an output filename, and a filename is one path
    // component: "2026/09/12" is a perfectly good string and put the PDF in a
    // folder nobody asked for. Refused before an image is touched, so the
    // caller is told which value was wrong rather than finding the output
    // somewhere else.
    const refused = ["/../../elsewhere/result", "2026/09/12", "nonsense", 20260904];

    for (const timestamp of refused) {
        const app = createFakeApp([
            ["/bin/cat", JSON.stringify({ dpi: 72, timestamp })]
        ]);

        assert.throws(
            () => collectInvocation(
                app,
                ["--headless", "/tmp/c.json", "/a/1.png"],
                true
            ),
            /must be YYYYMMDD_HHMMSS/u,
            String(timestamp)
        );
    }
});

test("a headless invocation without a config and an image is rejected", () => {
    const app = createFakeApp();

    assert.throws(
        () => collectInvocation(app, ["--headless", "/tmp/c.json"], true),
        /Headless usage/u
    );
});
