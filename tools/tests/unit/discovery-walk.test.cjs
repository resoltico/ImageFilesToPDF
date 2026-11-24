"use strict";

/*
 * The walk itself, driven against a fixture tree rather than observed passing
 * against a repository that already happens to be in order.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const loadDiscovery = () => import("../../../tools/lint/discovery.mjs");

function fixtureTree(files) {
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

test("the root itself is a directory the walk can be asked for", async () => {
    // Documents live at the top of the repository, so the walk has to name
    // what it finds there without a leading separator -- and must not descend
    // into the sandbox, which holds a copy of this whole repository.
    const { walk } = await loadDiscovery();
    const base = fixtureTree([
        "README.md",
        "docs/guide.md",
        "src/thing.js",
        ".stryker-tmp/README.md",
        "reports/mutation/index.md"
    ]);

    assert.deepEqual(
        await walk("", base, (name) => name.endsWith(".md")),
        ["README.md", "docs/guide.md"]
    );
});
