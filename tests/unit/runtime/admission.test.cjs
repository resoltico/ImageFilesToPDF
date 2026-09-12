"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    finderSelection,
    collectInvocation
} = require("../../../src/runtime/input.js");
const { collectImageFiles } = require("../../../src/runtime/admission.js");
const { createFakeApp, failing } = require("./fake-app.cjs");

/*
 * Application() is a JavaScriptCore host global, supplied here so the
 * resolution logic can be exercised directly.
 */
globalThis.applicationsAsked = [];
globalThis.Application = (name) => {
    globalThis.applicationsAsked.push(name);

    return { selection: () => globalThis.finderItems ?? [] };
};

test("what cannot be converted is reported, not dropped", () => {
    // A silent filter turned a GIF selected alongside a photo into a report
    // that nothing had failed, so the count described the surviving subset
    // rather than what was asked for.
    const app = createFakeApp([["'/a/missing.png'", failing("1")]]);
    const { images, rejected } = collectImageFiles(app, [
        "/a/photo.JPG",
        "/a/notes.txt",
        "/a/missing.png"
    ]);

    assert.deepEqual(images.map((record) => record.originalName), ["photo.JPG"]);
    assert.deepEqual(rejected.map((entry) => entry.name), ["notes.txt", "missing.png"]);
    assert.match(rejected[0].reason, /not a supported format/u);
    assert.match(rejected[1].reason, /not a readable file/u);
});

test("collectImageFiles keeps only supported, regular files", () => {
    const app = createFakeApp([["'/a/missing.png'", failing("1")]]);
    const { images: records } = collectImageFiles(app, [
        "/a/photo.JPG",
        "/a/notes.txt",
        "/a/missing.png",
        "/a/scan.png"
    ]);

    assert.deepEqual(records.map((record) => record.path), ["/a/photo.JPG", "/a/scan.png"]);
    assert.deepEqual(records.map((record) => record.originalName), ["photo.JPG", "scan.png"]);
});

test("collectImageFiles returns them in natural order", () => {
    const app = createFakeApp();
    const { images: records } = collectImageFiles(app, [
        "/a/page10.png",
        "/a/page2.png",
        "/a/page1.png"
    ]);

    assert.deepEqual(
        records.map((record) => record.originalName),
        ["page1.png", "page2.png", "page10.png"]
    );
});

test("collectImageFiles falls back to the Finder selection", () => {
    const app = createFakeApp();

    globalThis.finderItems = ["/a/fromfinder.png"];
    assert.deepEqual(
        collectImageFiles(app, []).images.map((record) => record.path),
        ["/a/fromfinder.png"]
    );
    globalThis.finderItems = [];
});

test("finderSelection asks Finder, by name, for its selection", () => {
    // Which application is asked is the whole content of this function. A
    // stub that ignores the name would let it ask anything at all.
    globalThis.finderItems = ["/a/x.png"];
    globalThis.applicationsAsked = [];

    assert.deepEqual(finderSelection(), ["/a/x.png"]);
    assert.deepEqual(globalThis.applicationsAsked, ["Finder"]);

    globalThis.finderItems = [];
});

test("an interactive invocation defers its settings", () => {
    // Nothing is asked here: the dialogs come after the preflight and after
    // there is known to be something to convert.
    const app = createFakeApp();
    const invocation = collectInvocation(app, ["/a/1.png"], false);

    assert.equal(invocation.settings, null);
    assert.equal(invocation.timestamp, "");
    assert.deepEqual(invocation.inputItems, ["/a/1.png"]);
    assert.equal(app.listPrompts.length, 0, "no dialog before the checks");
});

test("a long list of rejections is truncated, and says how many", () => {
    // A selection can be large, and a dialog listing forty reasons is not a
    // dialog anyone reads.
    const { describeRejections } = require("../../../src/runtime/completion.js");
    const many = Array.from({ length: 15 }, (ignored, index) => ({
        name: `file${index}.gif`,
        reason: "not a supported format"
    }));
    const lines = describeRejections(many).split("\n");

    assert.equal(lines[0], "Not converted:");
    assert.equal(lines.length, 14, "a heading, twelve entries, and a count");
    assert.equal(lines.at(-1), "...and 3 more.");
});
