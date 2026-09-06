"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const loadRelease = () => import("../../tools/release.mjs");
const loadBundle = () => import("../../tools/bundle.mjs");
const loadJavaScript = () => import("../../tools/javascript.mjs");

test("the release renders a banner, a strict directive and every module", async () => {
    const { renderRelease, moduleOrder } = await loadRelease();
    const release = await renderRelease();

    assert.match(release, /^\/\*\n \* Image Files to PDF \d+\.\d+\.\d+\n/u);
    assert.match(release, /Requires macOS \d+\.\d+ or later/u);
    assert.match(release, /Generated file\./u);
    assert.ok(release.includes('"use strict";'));

    const { sectionMarkerFor } = await loadBundle();

    for (const relativePath of moduleOrder) {
        assert.ok(
            release.includes(sectionMarkerFor(relativePath)),
            `${relativePath} must appear in the bundle`
        );
    }
});

test("the release carries no module syntax and declares run()", async () => {
    const { renderRelease } = await loadRelease();
    const release = await renderRelease();

    assert.ok(!/\brequire\s*\(/u.test(release), "no require survived");
    assert.ok(!/\bmodule\.exports\b/u.test(release), "no export survived");
    assert.match(release, /^function run\(input, parameters\) \{$/mu);
});

test("rendering is deterministic", async () => {
    const { renderRelease, digestOf } = await loadRelease();

    assert.equal(digestOf(await renderRelease()), digestOf(await renderRelease()));
});

test("the manifest is in sha256sum format", async () => {
    const { digestOf, renderManifest } = await loadRelease();
    const digest = digestOf("content");

    assert.match(digest, /^[0-9a-f]{64}$/u);
    assert.equal(renderManifest(digest), `${digest}  Image-Files-to-PDF.jxa\n`);
});

test("a bundle without a top-level run() is refused", async () => {
    const { assertEntryPoint } = await loadRelease();

    assert.doesNotThrow(() => assertEntryPoint(new Map([["run", "src/runtime/main.js"]])));
    assert.throws(
        () => assertEntryPoint(new Map([["execute", "src/runtime/main.js"]])),
        /declares no top-level run\(\); osascript needs it/u
    );
});

test("the declared floor is a real macOS version and ECMAScript year", async () => {
    const { MINIMUM_MACOS, ECMASCRIPT_TARGET } = await loadRelease();

    assert.match(MINIMUM_MACOS, /^\d+(?:\.\d+)?$/u);
    assert.ok(ECMASCRIPT_TARGET >= 2015 && ECMASCRIPT_TARGET <= 2030);
});

test("the only comments shipped are the banner and the module markers", async () => {
    // Asserted against the real artifact and against neither side's idea of
    // what a marker looks like: whatever the format becomes, what survives is
    // the banner plus exactly one marker per bundled module, and nothing that
    // was written in a source file.
    const { renderRelease, moduleOrder, ECMASCRIPT_TARGET } = await loadRelease();
    const { markerTextsFor } = await loadBundle();
    const { commentsIn } = await loadJavaScript();
    const release = await renderRelease();
    const comments = commentsIn(release, ECMASCRIPT_TARGET);
    const markers = markerTextsFor(moduleOrder);

    assert.equal(comments[0].start, 0, "the banner opens the file");
    assert.deepEqual(
        comments.slice(1).map((comment) => comment.text),
        moduleOrder.map((relativePath) => [...markerTextsFor([relativePath])][0]),
        "one marker per module, in bundle order, and nothing else"
    );
    assert.equal(comments.length, markers.size + 1);
});

test("the banner carries the licence and the address of the source", async () => {
    // The artifact is pasted into Shortcuts and travels from there, so this is
    // the only place it can say whose it is and where it came from.
    const { renderRelease } = await loadRelease();
    const release = await renderRelease();
    const packageJson = require("../../package.json");

    assert.ok(release.includes(` * ${packageJson.homepage}\n`), "the URL");
    assert.match(release, /^\/\*[\s\S]*? \* Copyright \(c\) \d{4}/u);
    assert.ok(
        release.includes(`SPDX-License-Identifier: ${packageJson.license}`),
        "the licence, as an identifier a machine can read"
    );
});

test("the artifact's name survives being uploaded as a release asset", async () => {
    // GitHub replaces spaces with dots when an asset is uploaded, so a file
    // named with them arrives as something the manifest beside it does not
    // name -- and neither the checksum nor the documented verify command
    // works. This shipped once.
    const { artifactName, renderManifest } = await loadRelease();

    assert.doesNotMatch(artifactName, /\s/u, "no spaces");
    assert.match(artifactName, /^[\w.-]+\.jxa$/u, "nothing a URL would escape");
    assert.ok(
        renderManifest("d").endsWith(`  ${artifactName}\n`),
        "the manifest names the file that is uploaded"
    );
});
