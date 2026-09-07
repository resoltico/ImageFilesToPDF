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

    assert.equal(tree.inspect("/t").kind, "directory");
    assert.equal(tree.inspect("/t/a.png").kind, "file");
    assert.equal(tree.inspect("/t/app").kind, "package");
    assert.equal(tree.inspect("/t/link").kind, "other");
    assert.equal(tree.inspect("/t/gone").kind, "missing");
});

test("which file a path names comes back with what it is", () => {
    // Two spellings of one file give the same volume and the same file
    // number, which is how a case-insensitive Mac says they are one
    // photograph. It comes out of the attributes already being read.
    const world = {
        attributes: {
            "/t/A.png": {
                NSFileType: "NSFileTypeRegular",
                NSFileSystemNumber: 16777232,
                NSFileSystemFileNumber: 308723978
            }
        }
    };
    const { objc, ns, ref } = bridgeOf(world);
    const tree = createTree(objc, ns, ref);

    assert.equal(tree.inspect("/t/A.png").identity, "16777232:308723978");
    assert.equal(tree.inspect("/t/gone.png").identity, "", "nothing to identify");
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
