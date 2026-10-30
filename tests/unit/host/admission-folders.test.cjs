"use strict";

/*
 * A selected folder means the images inside it, and the PDF lands where the
 * person pointed rather than in whichever subfolder happened to sort first.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { collectImageFiles } = require("../ports/fake-selection.cjs");
const { createFakeApp } = require("../ports/fake-app.cjs");
const { treeOf } = require("../ports/fake-tree.cjs");

function appWith(directories) {
    const app = createFakeApp();

    app.directories = directories;

    return app;
}

test("a selected folder becomes the images inside it, in folder order", () => {
    const tree = treeOf({
        "/Trip": ["top.png", "Berlin", "Aalborg"],
        "/Trip/Aalborg": ["10.png", "2.png"],
        "/Trip/Berlin": ["1.png"]
    });
    const { images, rejected, selectedFolders } = collectImageFiles(
        appWith(["/Trip"]),
        ["/Trip"],
        tree
    );

    assert.deepEqual(images.map((image) => image.path), [
        "/Trip/Aalborg/2.png",
        "/Trip/Aalborg/10.png",
        "/Trip/Berlin/1.png",
        "/Trip/top.png"
    ]);
    assert.deepEqual(rejected, []);
    assert.equal(selectedFolders, 1);
});

test("the PDF goes in the folder that was selected", () => {
    // Not in the subfolder whose name happened to sort first, which is where
    // "beside the first image" would have put it.
    const tree = treeOf({
        "/Trip": ["Aalborg"],
        "/Trip/Aalborg": ["2.png"]
    });
    const { images } = collectImageFiles(appWith(["/Trip"]), ["/Trip"], tree);

    assert.deepEqual(images.map((image) => image.folder), ["/Trip/"]);
});

test("a file selected by hand still goes beside itself", () => {
    const { images, selectedFolders } = collectImageFiles(
        appWith([]),
        ["/a/photo.png"],
        treeOf({})
    );

    assert.equal(selectedFolders, 0);
    assert.deepEqual(images, [{
        path: "/a/photo.png",
        originalName: "photo.png",
        folder: "/a/"
    }]);
});

test("a folder that holds nothing to convert says so", () => {
    // "No images selected" would be a reply to somebody who selected nothing.
    const { rejected } = collectImageFiles(
        appWith(["/empty"]),
        ["/empty"],
        treeOf({ "/empty": ["notes.txt"] })
    );

    assert.deepEqual(rejected.map((entry) => `${entry.name}: ${entry.reason}`), [
        "empty: This folder contains no supported images."
    ]);
});

test("a folder and a file inside it do not convert it twice", () => {
    const tree = treeOf({ "/Trip": ["a.png", "b.png"] });
    const { images } = collectImageFiles(
        appWith(["/Trip"]),
        ["/Trip/a.png", "/Trip"],
        tree
    );

    assert.deepEqual(images.map((image) => image.path), [
        "/Trip/a.png",
        "/Trip/b.png"
    ]);
});

test("a subfolder that could not be read is named, not passed over", () => {
    // The images elsewhere in the folder are still converted -- and the
    // report says which folder was closed, which is what lets someone go and
    // look at its permissions.
    const tree = treeOf(
        { "/Trip": ["a.png", "Locked"] },
        { "/Trip/Locked": "directory" }
    );
    const { images, rejected, selectedFolders } = collectImageFiles(
        appWith(["/Trip"]),
        ["/Trip"],
        tree
    );

    assert.equal(selectedFolders, 1);
    assert.deepEqual(images.map((image) => image.path), ["/Trip/a.png"]);
    assert.deepEqual(rejected, [{
        path: "/Trip/Locked",
        name: "Locked",
        reason: "This item could not be read.", code: "selection-refused", stage: "selection"
    }]);
});

test("missing mandatory tree fails setup for every selection", () => {
    const { collectImageFiles: collect } = require("../../../src/host/admission.js");
    assert.throws(() => collect(createFakeApp(), ["/photos", "/photos/photo.png"], null), /Required filesystem/u);
});
