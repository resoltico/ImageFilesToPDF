"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

/*
 * Discovery decides what the gate is allowed to see. A file it misses is a
 * file with no size limit, no whitespace rules and no control-character
 * check — which is exactly how eslint.config.mjs once reached 173 lines.
 */
const loadDiscovery = () => import("../../../tools/lint/discovery.mjs");
const ROOT = path.resolve(__dirname, "../../..");
const SKIPPED = new Set(["node_modules", "dist", "build", ".git", ".stryker-tmp", "reports"]);

function everySourceFile(directory, found = []) {
    const entries = fs
        .readdirSync(path.join(ROOT, directory), { withFileTypes: true })
        .filter((entry) => !SKIPPED.has(entry.name));

    for (const entry of entries) {
        const relative = directory === "." ? entry.name : `${directory}/${entry.name}`;

        if (entry.isDirectory()) {
            everySourceFile(relative, found);
        } else if (/\.(?:js|mjs|cjs)$/u.test(entry.name)) {
            found.push(relative);
        }
    }

    return found;
}

test("no JavaScript file in the repository escapes the gate", async () => {
    const { lintableFiles } = await loadDiscovery();
    const checked = new Set(await lintableFiles());
    const missed = everySourceFile(".").filter((file) => !checked.has(file));

    assert.deepEqual(missed, [], "these files would be unchecked");
});

test("discovery reaches nested directories and root configuration", async () => {
    const { lintableFiles } = await loadDiscovery();
    const files = await lintableFiles();

    assert.ok(files.includes("eslint.config.mjs"), "root config");
    assert.ok(files.some((file) => file.startsWith("tools/lint/")), "nested tools");
    assert.ok(files.some((file) => file.startsWith("tests/unit/core/")), "nested tests");
    assert.ok(files.some((file) => file.startsWith("tests/unit/runtime/")), "nested tests");
    assert.ok(files.some((file) => file.startsWith("src/")), "source modules");
});

test("build output is not linted", async () => {
    const { lintableFiles } = await loadDiscovery();
    const files = await lintableFiles();

    assert.ok(!files.some((file) => file.startsWith("dist/")));
    assert.ok(!files.some((file) => file.includes("node_modules")));
});

test("the source-file test is anchored at the extension", async () => {
    const { isSourceFile } = await loadDiscovery();

    for (const name of ["a.js", "a.mjs", "a.cjs", "deep.name.js"]) {
        assert.equal(isSourceFile(name), true, name);
    }

    // Unanchored, a backup or a template would be linted as source.
    for (const name of ["a.js.bak", "a.mjs~", "a.cjs.orig", "a.json", "ajs", "a.ts"]) {
        assert.equal(isSourceFile(name), false, name);
    }
});

test("the skip list covers every directory that is not ours, and no others", async () => {
    const { isSkipped } = await loadDiscovery();

    for (const name of ["node_modules", "dist", ".git"]) {
        assert.equal(isSkipped(name), true, name);
    }

    assert.equal(isSkipped("src"), false);
    assert.equal(isSkipped("tools"), false);
    assert.equal(isSkipped("tests"), false);

    // A skip entry for a directory nothing creates is not merely dead: if one
    // ever appeared, real source inside it would leave the gate silently.
    assert.equal(isSkipped("build"), false, "build/ is created by nothing here");
});

function fixtureTree(files) {
    const os = require("node:os");
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "discovery-"));

    for (const relative of files) {
        const target = path.join(base, relative);

        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, "\n");
    }

    test.after(() => fs.rmSync(base, { recursive: true, force: true }));

    return base;
}

test("discovery order does not depend on how the directory reads back", async () => {
    // readdir gives no ordering guarantee. "lib" sorts before "lib-extra.mjs"
    // as a directory entry, while "lib-extra.mjs" sorts before "lib/a.mjs" as
    // a path — so an unsorted walk reports a different order on a filesystem
    // that reads back differently, and the gate's own output stops being
    // reproducible.
    const { walk } = await loadDiscovery();
    const base = fixtureTree([
        "here/lib/a.mjs",
        "here/lib-extra.mjs",
        "here/notes.md"
    ]);

    assert.deepEqual(await walk("here", base), [
        "here/lib-extra.mjs",
        "here/lib/a.mjs"
    ]);
});

test("the walk skips what is not ours, at any depth", async () => {
    const { walk } = await loadDiscovery();
    const base = fixtureTree([
        "here/node_modules/x.mjs",
        "here/deep/deeper/y.cjs"
    ]);

    assert.deepEqual(await walk("here", base), ["here/deep/deeper/y.cjs"]);
});
