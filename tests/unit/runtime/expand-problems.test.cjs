"use strict";

/*
 * What the walk could not look at.
 *
 * A folder it cannot read and an entry it cannot get the attributes of are
 * both things that might have been photographs. Leaving them out and
 * reporting success is how a run loses work quietly -- which it did: a folder
 * whose photographs were all in a subfolder nobody had permission to open
 * produced a PDF of whatever else was lying around and said nothing.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { imagesInFolder } = require("../../../src/runtime/expand.js");

function treeOf(shape, kinds = {}) {
    return {
        entries: (path) => shape[path] ?? null,
        kind: (path) => kinds[path] ?? (shape[path] ? "directory" : "file"),
        standardize: (path) => path
    };
}
test("a subfolder that cannot be read comes back with the images", () => {
    // Its result used to be thrown away, so a folder whose photographs were
    // all in a subfolder nobody had permission to open produced a PDF of
    // whatever else was lying around and said nothing about the rest.
    const tree = treeOf(
        { "/t": ["a.png", "locked", "sub"], "/t/sub": ["b.png"] },
        { "/t/locked": "directory" }
    );
    const outcome = imagesInFolder(tree, "/t", new Set());

    assert.deepEqual(outcome.found, ["/t/a.png", "/t/sub/b.png"]);
    assert.deepEqual(outcome.problems, [
        { path: "/t/locked", reason: "could not be read" }
    ]);
});

test("an entry the walk cannot look at comes back too", () => {
    // A listing can succeed while inspecting what it listed fails -- a folder
    // with read but not execute permission does exactly that -- and an item
    // nobody could look at might have been a photograph. Passing over it
    // silently is how a run loses work and reports success.
    const tree = treeOf(
        { "/t": ["a.png", "b.png", "sub"] },
        { "/t/b.png": "missing", "/t/sub": "missing" }
    );
    const outcome = imagesInFolder(tree, "/t", new Set());

    assert.deepEqual(outcome.found, ["/t/a.png"]);
    assert.deepEqual(outcome.problems, [
        { path: "/t/b.png", reason: "could not be examined" },
        { path: "/t/sub", reason: "could not be examined" }
    ]);
});

test("a folder holding nothing new is not a folder holding nothing", () => {
    // Selecting a folder and a folder inside it: by the time the inner one is
    // walked, everything in it is already in the run. That is not a folder to
    // complain about.
    const tree = treeOf({ "/t": ["a.png"] });
    const outcome = imagesInFolder(tree, "/t", new Set(["/t/a.png"]));

    assert.deepEqual(outcome.found, []);
    assert.equal(outcome.reason, "");
});

test("a folder whose only images are unreadable says both things", () => {
    const tree = treeOf({ "/t": ["locked"] }, { "/t/locked": "directory" });
    const outcome = imagesInFolder(tree, "/t", new Set());

    assert.equal(outcome.reason, "contains no supported images");
    assert.deepEqual(outcome.problems, [
        { path: "/t/locked", reason: "could not be read" }
    ]);
});

test("the folder that was selected is reported as itself, once", () => {
    // Unreadable at the root is the folder the user chose, not something
    // unreadable inside it.
    const outcome = imagesInFolder(treeOf({}), "/nope", new Set());

    assert.equal(outcome.reason, "could not be read");
    assert.deepEqual(outcome.problems, []);
});

