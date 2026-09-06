"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    inputItemToPosixPath,
    finderSelection,
    collectImageFiles,
    collectInvocation
} = require("../../../src/runtime/input.js");
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

test("a POSIX path is used as-is", () => {
    assert.equal(inputItemToPosixPath("/a/b.png"), "/a/b.png");
});

test("a file URL is decoded to a POSIX path", () => {
    assert.equal(inputItemToPosixPath("file:///a/b%20c.png"), "/a/b c.png");
});

test("an item that is not a path resolves to nothing", () => {
    // Not an error: Shortcuts appends a parameters object to every Quick
    // Action input, so this is the ordinary case, and one unrecognisable item
    // must not discard the images beside it.
    assert.equal(inputItemToPosixPath("not-a-path"), "");
    assert.equal(inputItemToPosixPath({}), "");
    assert.equal(inputItemToPosixPath(""), "");
});

test("collectImageFiles keeps only supported, regular files", () => {
    const app = createFakeApp([["'/a/missing.png'", failing("1")]]);
    const records = collectImageFiles(app, [
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
    const records = collectImageFiles(app, [
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
        collectImageFiles(app, []).map((record) => record.path),
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

test("a headless invocation without a config and an image is rejected", () => {
    const app = createFakeApp();

    assert.throws(
        () => collectInvocation(app, ["--headless", "/tmp/c.json"], true),
        /Headless usage/u
    );
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
