"use strict";

/*
 * One selection is one thing, whatever it was called and whatever order it
 * arrived in. A folder selected alongside a photo inside it used to convert
 * that photo twice, and selecting them the other way round made the folder
 * report that it held nothing to convert -- the same selection, two answers,
 * decided by the order Finder happened to hand it over.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { collectImageFiles } = require("../../../src/runtime/admission.js");
const { createFakeApp } = require("./fake-app.cjs");
const { treeOf } = require("./fake-tree.cjs");

function appWith(directories) {
    const app = createFakeApp();

    app.directories = directories;

    return app;
}

function collect(selection, tree) {
    return collectImageFiles(appWith(["/Trip"]), selection, tree);
}

test("two spellings of one file are one photograph", () => {
    // A Mac is case-insensitive as formatted, so /Trip/A.png and /Trip/a.png
    // are one file -- measured: the same volume and the same file number.
    // Comparing the spellings put it in the PDF twice.
    const tree = treeOf(
        { "/Trip": ["A.png"] },
        {},
        { "/Trip/A.png": "16777232:99", "/Trip/a.png": "16777232:99" }
    );

    for (const selection of [
        ["/Trip", "/Trip/a.png"],
        ["/Trip/a.png", "/Trip"],
        ["/Trip/A.png", "/Trip/a.png"]
    ]) {
        const { images, rejected } = collectImageFiles(
            appWith(["/Trip"]),
            selection,
            tree
        );

        assert.equal(images.length, 1, selection.join(" then "));
        // The name it is stored under: a folder is walked before any
        // explicit request, and its own listing gives the real spelling.
        assert.equal(
            images[0].path,
            "/Trip/A.png",
            `for ${selection.join(" then ")}`
        );
        assert.deepEqual(rejected, []);
    }
});

test("the same folder under two names is one folder", () => {
    // A trailing separator, or the path Finder gives against the one a
    // Shortcut passes. Standardizing is what makes them the same selection.
    const tree = treeOf({ "/Trip": ["a.png"] });
    const { images } = collect(["/Trip", "/Trip/"], tree);

    assert.deepEqual(images.map((image) => image.path), ["/Trip/a.png"]);
});

test("what a selected path is, is asked once", () => {
    // Asking the tree is asking Foundation, and the same folder handed over
    // twice is one selection: it is settled once and not asked again.
    const asked = [];
    const tree = {
        entries: (path) => (path === "/Trip" ? ["a.png"] : null),
        inspect: (path) => {
            asked.push(path);

            return {
                kind: path === "/Trip" ? "directory" : "file",
                identity: path
            };
        },
        standardize: (path) => path.replace(/\/+$/u, "")
    };

    collect(["/Trip", "/Trip/", "/Trip"], tree);

    // The walk asks about what it finds inside; the selection itself is
    // classified once, however many times it was handed over.
    assert.deepEqual(asked.filter((path) => path === "/Trip"), ["/Trip"]);
});

test("a folder inside a selected folder is not reported as empty", () => {
    // Everything in it is already in the run by the time it is walked, which
    // is not the same as it holding nothing -- and the images belong to the
    // outermost folder that was selected, whichever order they arrived in.
    const tree = treeOf({ "/Trip": ["Berlin"], "/Trip/Berlin": ["1.png"] });

    for (const selection of [
        ["/Trip", "/Trip/Berlin"],
        ["/Trip/Berlin", "/Trip"]
    ]) {
        const { images, rejected } = collectImageFiles(
            appWith(["/Trip", "/Trip/Berlin"]),
            selection,
            tree
        );

        assert.deepEqual(images.map((image) => image.path), ["/Trip/Berlin/1.png"]);
        assert.deepEqual(images.map((image) => image.folder), ["/Trip/"],
            `the outermost selection owns it, for ${selection.join(" then ")}`);
        assert.deepEqual(rejected, []);
    }
});

test("a folder beside one whose name it starts with is still its own folder", () => {
    // /Trip-2024 is not inside /Trip. Comparing the names without the
    // separator would swallow it.
    const tree = treeOf({ "/Trip": ["a.png"], "/Trip-2024": ["b.png"] });
    const { images } = collectImageFiles(
        appWith(["/Trip", "/Trip-2024"]),
        ["/Trip", "/Trip-2024"],
        tree
    );

    assert.deepEqual(images.map((image) => image.path).sort(), [
        "/Trip-2024/b.png",
        "/Trip/a.png"
    ]);
});

test("without a tree, a photo inside a refused folder is still converted", () => {
    // The folder is turned away rather than walked, so nothing else will find
    // that photo.
    const { images, rejected } = collectImageFiles(
        appWith(["/Trip"]),
        ["/Trip", "/Trip/a.png"]
    );

    assert.deepEqual(images.map((image) => image.path), ["/Trip/a.png"]);
    assert.deepEqual(rejected.map((entry) => entry.reason), [
        "a folder; select the images inside it"
    ]);
});
