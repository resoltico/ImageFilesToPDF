"use strict";

/*
 * Materializing the embedded engine in the user's Application Support: the
 * file is written once, a different file is replaced and never run, and only
 * this user's older engine files are removed.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { createFoundation, withFoundation } = require("../ports/fake-foundation.cjs");
const { materializeEngine } = require("../../../src/finder/quick-action/engine-cache.js");
const { message } = require("../../../src/core/messages.js");

const HOME = "/Users/test";
const FOLDER = `${HOME}/Library/Application Support/Image Files to PDF/Engine`;
const BUNDLE = { filename: "engine-5.0.0-abc.cjs", source: "console.log(1);\n" };
const FILE = `${FOLDER}/${BUNDLE.filename}`;

test("the engine is written once and then reused as it is", () => {
    const foundation = createFoundation();
    const path = withFoundation(foundation, () => materializeEngine(BUNDLE, HOME));
    assert.equal(path, FILE);
    assert.equal(foundation.state.files.get(FILE).content, BUNDLE.source);
    const before = [...foundation.state.files.keys()];
    withFoundation(foundation, () => materializeEngine(BUNDLE, HOME));
    assert.deepEqual([...foundation.state.files.keys()], before);
    assert.deepEqual(foundation.state.removed, []);
    assert.deepEqual(foundation.state.writes, [`${FILE}.UUID-1.tmp`], "written beside the engine under a fresh name, once");
    assert.deepEqual(foundation.state.directories.get(FOLDER).attributes, { NSFilePosixPermissions: 0o700 });
    assert.ok(foundation.state.imports.includes("Foundation"));
    assert.deepEqual(foundation.state.bindings.slice(0, 2), [["getuid", ["unsigned int", []]], ["rename", ["int", ["char *", "char *"]]]]);
});

test("an engine with the right bytes is still replaced when it is not this user's, or cannot be read", () => {
    for (const entry of [{ content: BUNDLE.source, owner: 0 }, { content: BUNDLE.source, unreadable: true }]) {
        const foundation = createFoundation({ directories: [FOLDER], files: { [FILE]: entry } });
        withFoundation(foundation, () => materializeEngine(BUNDLE, HOME));
        assert.equal(foundation.state.writes.length, 1);
        assert.deepEqual(foundation.state.files.get(FILE), { content: BUNDLE.source, owner: 501 });
    }
});

test("a changed engine file is replaced, and only this user's older engines are removed", () => {
    const foundation = createFoundation({ directories: [FOLDER], files: {
        [FILE]: "tampered", [`${FOLDER}/engine-4.0.0-old.cjs`]: "old",
        [`${FOLDER}/engine-3.0.0-other.cjs`]: { content: "x", owner: 0 },
        [`${FOLDER}/engine-2.0.0-dir.cjs`]: { content: "x", type: "NSFileTypeDirectory" }, [`${FOLDER}/notes.txt`]: "keep",
        [`${FOLDER}/my-engine-1.cjs`]: "keep", [`${FOLDER}/engine-1.cjs.bak`]: "keep"
    } });
    withFoundation(foundation, () => materializeEngine(BUNDLE, HOME));
    assert.equal(foundation.state.files.get(FILE).content, BUNDLE.source);
    assert.deepEqual(foundation.state.removed, [`${FOLDER}/engine-4.0.0-old.cjs`]);
    assert.ok(![...foundation.state.files.keys()].some((path) => path.endsWith(".tmp")));
});

test("a cache folder owned by someone else is refused", () => {
    const foundation = createFoundation({ files: { [FOLDER]: { content: "", type: "NSFileTypeDirectory", owner: 0 } } });
    withFoundation(foundation, () => {
        assert.throws(() => materializeEngine(BUNDLE, HOME), (error) => error.message === message("engineCacheUnavailable"));
    });
});

test("an engine that cannot be written, renamed or verified is refused, and no temporary file stays", () => {
    for (const options of [{ writeFails: true }, { renameFails: true }]) {
        const foundation = createFoundation(options);
        withFoundation(foundation, () => {
            assert.throws(() => materializeEngine(BUNDLE, HOME), (error) => error.message === message("engineCacheWriteFailed"));
        });
        assert.ok(![...foundation.state.files.keys()].some((path) => path.endsWith(".tmp")));
    }
    const foundation = createFoundation({ afterRename: (state, path) => { state.files.set(path, { content: "swapped", owner: state.uid }); } });
    withFoundation(foundation, () => {
        assert.throws(() => materializeEngine(BUNDLE, HOME), (error) => error.message === message("engineCacheUnverified"));
    });
});

test("an engine folder that cannot be listed leaves older engines alone", () => {
    const foundation = createFoundation({ directories: [FOLDER], files: { [`${FOLDER}/engine-4.0.0-old.cjs`]: "old" } });
    foundation.$.NSFileManager.defaultManager.contentsOfDirectoryAtPathError = () => null;
    assert.equal(withFoundation(foundation, () => materializeEngine(BUNDLE, HOME)), FILE);
    assert.deepEqual(foundation.state.removed, []);
});
