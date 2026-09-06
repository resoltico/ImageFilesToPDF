"use strict";

/*
 * Which comments survive into the artifact.
 *
 * They are named, not recognised: the build hands over the exact text of the
 * comments it generated, so the side that writes them is the side that decides
 * what is kept. A shape has to be described twice and can be changed on one
 * side only; the text itself cannot.
 */

const assert = require("node:assert/strict");
const test = require("node:test");

const load = () => import("../../../tools/strip-comments.mjs");
const loadBundle = () => import("../../../tools/bundle.mjs");
const loadRelease = () => import("../../../tools/release.mjs");

async function options(kept) {
    const { ECMASCRIPT_TARGET } = await loadRelease();

    return { ecmaVersion: ECMASCRIPT_TARGET, kept };
}

test("what the bundler writes is what the stripper keeps", async () => {
    // The one assertion that stops the two drifting: change the marker format
    // on either side alone and this fails, instead of the artifact quietly
    // losing the markers while every check still passes.
    const { sectionMarkerFor, markerTextsFor } = await loadBundle();
    const { stripComments } = await load();
    const marker = sectionMarkerFor("src/core/version.js");
    const source = `/* banner */\n${marker}\nconst value = 1;\n`;

    assert.equal(
        stripComments(source, await options(markerTextsFor(["src/core/version.js"]))),
        source
    );
});

test("a marker for a module that was not bundled is not kept", async () => {
    const { sectionMarkerFor, markerTextsFor } = await loadBundle();
    const { stripComments } = await load();
    const source = [
        "/* banner */",
        sectionMarkerFor("src/core/version.js"),
        sectionMarkerFor("src/core/absent.js"),
        "const value = 1;"
    ].join("\n");

    assert.equal(
        stripComments(source, await options(markerTextsFor(["src/core/version.js"]))),
        [
            "/* banner */",
            sectionMarkerFor("src/core/version.js"),
            "const value = 1;"
        ].join("\n")
    );
});

test("a comment that merely resembles a marker is not kept", async () => {
    // Shape is not the test, so a source comment cannot smuggle itself in.
    const { markerTextsFor } = await loadBundle();
    const { stripComments } = await load();
    const source = [
        "/* banner */",
        "/* ===== src/core/version.js ===== */",
        "/*  ===== src/core/version.js =====  */",
        "const value = 1;"
    ].join("\n");

    assert.equal(
        stripComments(source, await options(markerTextsFor(["src/core/version.js"]))),
        [
            "/* banner */",
            "/* ===== src/core/version.js ===== */",
            "const value = 1;"
        ].join("\n")
    );
});

test("the comment the file opens with is kept, and only that one", async () => {
    // By where it is rather than by which one it is: the banner is the comment
    // the artifact starts with, and a second one at the top is not a banner.
    const { stripComments } = await load();

    assert.equal(
        stripComments("/* banner */\n/* not the banner */\nconst v = 1;\n", await options()),
        "/* banner */\nconst v = 1;\n"
    );
});

test("nothing is kept when the build names nothing", async () => {
    const { stripComments } = await load();

    assert.equal(
        stripComments("/* banner */\n/* ===== x ===== */\nconst v = 1;\n", await options()),
        "/* banner */\nconst v = 1;\n"
    );
});

test("a marker's text is the comment without its delimiters", async () => {
    const { sectionMarkerFor, markerTextsFor } = await loadBundle();
    const marker = sectionMarkerFor("src/a.js");

    assert.equal(marker, "/* ===== src/a.js ===== */");
    assert.deepEqual(
        [...markerTextsFor(["src/a.js"])],
        [marker.slice(2, -2)],
        "what acorn reports as the comment's text"
    );
});
