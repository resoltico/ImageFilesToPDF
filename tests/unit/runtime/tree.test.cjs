"use strict";

/*
 * What the filesystem says about a path, asked through the ObjC bridge
 * because a directory listing has to come back as a list: a filename may
 * contain a newline, and no text separator survives that.
 *
 * The bridge is a parameter, so what it is asked and what it makes of the
 * answers can both be driven from here.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { createTree, kindFrom } = require("../../../src/runtime/tree.js");

function bridgeOf(world = {}, imports = []) {
    const ns = (value) => ({
        boxed: value,
        // stringByStandardizingPath is a property, not a call.
        stringByStandardizingPath: value.replace("/../t", "")
    });

    ns.NSFileManager = {
        defaultManager: {
            attributesOfItemAtPathError: (path) => world.attributes?.[path.boxed],
            contentsOfDirectoryAtPathError: (path) => world.entries?.[path.boxed]
        }
    };
    ns.NSWorkspace = {
        sharedWorkspace: {
            isFilePackageAtPath: (path) => Boolean(world.packages?.[path.boxed])
        }
    };

    const objc = {
        import: (name) => imports.push(name),
        deepUnwrap: (value) => value ?? null,
        unwrap: (value) => `standard:${value}`
    };

    return { objc, ns, ref: () => ({}) };
}

test("Foundation and AppKit are both asked for", () => {
    // The file questions come from one and the package question the other.
    const imports = [];

    createTree(...Object.values(bridgeOf({}, imports)));
    assert.deepEqual(imports, ["Foundation", "AppKit"]);
});

test("a folder, a file, a package and a link are told apart", () => {
    const world = {
        attributes: {
            "/t": { NSFileType: "NSFileTypeDirectory" },
            "/t/a.png": { NSFileType: "NSFileTypeRegular" },
            "/t/app": { NSFileType: "NSFileTypeDirectory" },
            "/t/link": { NSFileType: "NSFileTypeSymbolicLink" }
        },
        packages: { "/t/app": true }
    };
    const { objc, ns, ref } = bridgeOf(world);
    const tree = createTree(objc, ns, ref);

    assert.equal(tree.kind("/t"), "directory");
    assert.equal(tree.kind("/t/a.png"), "file");
    assert.equal(tree.kind("/t/app"), "package");
    assert.equal(tree.kind("/t/link"), "other");
    assert.equal(tree.kind("/t/gone"), "missing");
});

test("a package is only asked about once it is known to be a folder", () => {
    // Asking of every file would be an AppKit call per entry in the tree.
    const asked = [];
    const workspace = {
        isFilePackageAtPath: (path) => {
            asked.push(path.boxed);

            return false;
        }
    };

    kindFrom({ NSFileType: "NSFileTypeRegular" }, workspace, "/t/a.png", (path) => ({ boxed: path }));
    assert.deepEqual(asked, []);

    kindFrom({ NSFileType: "NSFileTypeDirectory" }, workspace, "/t", (path) => ({ boxed: path }));
    assert.deepEqual(asked, ["/t"]);
});

test("a listing comes back as a list, and an unreadable one as nothing", () => {
    const { objc, ns, ref } = bridgeOf({
        entries: { "/t": ["a.png", "two\nlines.png"] }
    });
    const tree = createTree(objc, ns, ref);

    assert.deepEqual(tree.entries("/t"), ["a.png", "two\nlines.png"]);
    assert.equal(tree.entries("/locked"), null);
});

test("a path is standardized, so the same folder is one folder", () => {
    const { objc, ns, ref } = bridgeOf();

    assert.equal(
        createTree(objc, ns, ref).standardize("/t/../t"),
        "standard:/t"
    );
});

test("without a bridge there is no tree, and no folder to walk", () => {
    // The action still converts the files it was given; a selected folder is
    // refused with a reason rather than expanded.
    const { objc, ns, ref } = bridgeOf();

    assert.equal(createTree(null, ns, ref), null);
    assert.equal(createTree(objc, null, ref), null);
    assert.equal(createTree(objc, ns, null), null);
    assert.equal(
        createTree({ import() {
            throw new Error("no Foundation here");
        } }, ns, ref),
        null
    );
});
