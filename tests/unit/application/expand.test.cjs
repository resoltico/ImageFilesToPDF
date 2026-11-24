"use strict";
const { inspectModule } = require("../ports/inspect-module.cjs");

/*
 * A selected folder means "convert the images in here", not "convert
 * everything in here". What is discovered inside is taken when it is a
 * supported image and passed over otherwise; what was selected by hand is
 * reported when it cannot be converted, because it was asked for.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { imagesInFolder } = require("../../../src/application/expand.js");
const { isHidden } = inspectModule(require.resolve("../../../src/application/expand.js"), ["isHidden"]);
const { treeOf } = require("../ports/fake-tree.cjs");

test("images are found through every subfolder, in one list", async () => {
    const tree = treeOf({
        "/t": ["a.png", "sub"],
        "/t/sub": ["b.jpg", "deep"],
        "/t/sub/deep": ["c.jpeg"]
    });

    assert.deepEqual((await imagesInFolder(tree, "/t", new Set())).found, [
        "/t/a.png",
        "/t/sub/b.jpg",
        "/t/sub/deep/c.jpeg"
    ]);
});

test("what nobody asked for is passed over without a word", async () => {
    // A folder of documents would otherwise report a rejection for each one.
    const tree = treeOf(
        { "/t": ["a.png", "notes.txt", "clip.gif", ".hidden.png", "Photos.app", "link"] },
        { "/t/Photos.app": "package", "/t/link": "link" }
    );

    assert.deepEqual((await imagesInFolder(tree, "/t", new Set())).found, ["/t/a.png"]);
});

test("a link with an image's name is still a link", async () => {
    // Taking it would mean following it, which is how a walk leaves the
    // folder it was given and how it finds the same file twice.
    const tree = treeOf(
        { "/t": ["photo.png"] },
        { "/t/photo.png": "link" }
    );

    assert.equal(
        (await imagesInFolder(tree, "/t", new Set())).code,
        "empty-folder"
    );
});

test("a link is not followed, however it is reached", async () => {
    // Following one is how a walk leaves the folder it was given, and how it
    // finds the same file twice.
    const tree = treeOf(
        { "/t": ["elsewhere"], "/elsewhere": ["a.png"] },
        { "/t/elsewhere": "link" }
    );

    assert.equal((await imagesInFolder(tree, "/t", new Set())).code, "empty-folder");
});

test("a folder that cannot be read says so", async () => {
    const tree = treeOf({ "/t": ["locked"] }, { "/t/locked": "directory" });

    assert.equal((await imagesInFolder(tree, "/nope", new Set())).code, "unreadable");
});

test("a folder holding nothing to convert says that, not nothing", async () => {
    // The user selected it. "No images selected" would be a reply to somebody
    // who selected nothing.
    const tree = treeOf({ "/t": ["notes.txt"] });

    assert.equal(
        (await imagesInFolder(tree, "/t", new Set())).code,
        "empty-folder"
    );
});

test("a file already taken is not taken again", async () => {
    // Selecting a folder and something inside it, or a folder twice. What is
    // already taken is a file, not a name: the ledger holds what the
    // filesystem says each one is.
    const tree = treeOf({ "/t": ["a.png", "b.png"] });

    assert.deepEqual(
        (await imagesInFolder(tree, "/t", new Set(["/t/a.png"]))).found,
        ["/t/b.png"]
    );
});

test("a folder whose images are all in the run already is not called empty", async () => {
    // Selecting a folder and the folder above it. There is nothing new to
    // take, which is not the same as there being nothing there: "contains no
    // supported images", said about a folder of photographs, is untrue.
    const tree = treeOf({ "/t": ["a.png"] });

    assert.equal((await imagesInFolder(tree, "/t", new Set(["/t/a.png"]))).code, "");
});

test("a file taken under another of its names is not taken again", async () => {
    const tree = treeOf(
        { "/t": ["A.png", "b.png"] },
        {},
        { "/t/A.png": "16777232:99" }
    );

    assert.deepEqual(
        (await imagesInFolder(tree, "/t", new Set(["16777232:99"]))).found,
        ["/t/b.png"]
    );
});

test("the walk records what it took, so the next folder does not take it again", async () => {
    // One set for the whole run: the folders are walked one after another and
    // each has to see what the ones before it found.
    const taken = new Set();

    (await imagesInFolder(
        treeOf({ "/t": ["a.png"] }, {}, { "/t/a.png": "16777232:7" }),
        "/t",
        taken
    ));

    assert.deepEqual([...taken], ["16777232:7"], "the file, not the name");
});

test("a dot-prefixed name is hidden, and only at the front", () => {
    assert.equal(isHidden(".DS_Store"), true);
    assert.equal(isHidden("holiday.2024.png"), false);
});


test("visible special files are reported before extension filtering while hidden entries and links stay excluded", async () => {
    const tree = treeOf({ "/t": ["a.png", "pipe.png", "device", ".hidden.png", "alias.png"] },
        { "/t/pipe.png": "other", "/t/device": "other", "/t/.hidden.png": "other", "/t/alias.png": "link" });
    const result = (await imagesInFolder(tree, "/t", new Set()));
    assert.deepEqual(result.found, ["/t/a.png"]);
    assert.deepEqual(result.problems, [{ path: "/t/pipe.png", code: "special-file" }, { path: "/t/device", code: "special-file" }]);
    assert.equal(result.code, "");
    assert.equal((await imagesInFolder(treeOf({ "/t": ["pipe"] }, { "/t/pipe": "other" }), "/t", new Set())).code, "");
});
