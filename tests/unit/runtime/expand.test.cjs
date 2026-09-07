"use strict";

/*
 * A selected folder means "convert the images in here", not "convert
 * everything in here". What is discovered inside is taken when it is a
 * supported image and passed over otherwise; what was selected by hand is
 * reported when it cannot be converted, because it was asked for.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { imagesInFolder, isHidden } = require("../../../src/runtime/expand.js");

function treeOf(shape, kinds = {}) {
    return {
        entries: (path) => shape[path] ?? null,
        kind: (path) => kinds[path] ?? (shape[path] ? "directory" : "file"),
        standardize: (path) => path
    };
}

test("images are found through every subfolder, in one list", () => {
    const tree = treeOf({
        "/t": ["a.png", "sub"],
        "/t/sub": ["b.jpg", "deep"],
        "/t/sub/deep": ["c.jpeg"]
    });

    assert.deepEqual(imagesInFolder(tree, "/t", new Set()).found, [
        "/t/a.png",
        "/t/sub/b.jpg",
        "/t/sub/deep/c.jpeg"
    ]);
});

test("what nobody asked for is passed over without a word", () => {
    // A folder of documents would otherwise report a rejection for each one.
    const tree = treeOf(
        { "/t": ["a.png", "notes.txt", "clip.gif", ".hidden.png", "Photos.app", "link"] },
        { "/t/Photos.app": "package", "/t/link": "other" }
    );

    assert.deepEqual(imagesInFolder(tree, "/t", new Set()).found, ["/t/a.png"]);
});

test("a link with an image's name is still a link", () => {
    // Taking it would mean following it, which is how a walk leaves the
    // folder it was given and how it finds the same file twice.
    const tree = treeOf(
        { "/t": ["photo.png"] },
        { "/t/photo.png": "other" }
    );

    assert.equal(
        imagesInFolder(tree, "/t", new Set()).reason,
        "contains no supported images"
    );
});

test("a link is not followed, however it is reached", () => {
    // Following one is how a walk leaves the folder it was given, and how it
    // finds the same file twice.
    const tree = treeOf(
        { "/t": ["elsewhere"], "/elsewhere": ["a.png"] },
        { "/t/elsewhere": "other" }
    );

    assert.equal(imagesInFolder(tree, "/t", new Set()).reason, "contains no supported images");
});

test("a folder that cannot be read says so", () => {
    const tree = treeOf({ "/t": ["locked"] }, { "/t/locked": "directory" });

    assert.equal(imagesInFolder(tree, "/nope", new Set()).reason, "could not be read");
});

test("a folder holding nothing to convert says that, not nothing", () => {
    // The user selected it. "No images selected" would be a reply to somebody
    // who selected nothing.
    const tree = treeOf({ "/t": ["notes.txt"] });

    assert.equal(
        imagesInFolder(tree, "/t", new Set()).reason,
        "contains no supported images"
    );
});

test("a file already taken is not taken again", () => {
    // Selecting a folder and something inside it, or a folder twice.
    const tree = treeOf({ "/t": ["a.png", "b.png"] });

    assert.deepEqual(
        imagesInFolder(tree, "/t", new Set(["/t/a.png"])).found,
        ["/t/b.png"]
    );
});

test("the walk records what it took, so the next folder does not take it again", () => {
    // One set for the whole run: the folders are walked one after another and
    // each has to see what the ones before it found.
    const taken = new Set();

    imagesInFolder(treeOf({ "/t": ["a.png"] }), "/t", taken);

    assert.deepEqual([...taken], ["/t/a.png"]);
});

test("a dot-prefixed name is hidden, and only at the front", () => {
    assert.equal(isHidden(".DS_Store"), true);
    assert.equal(isHidden("holiday.2024.png"), false);
});
