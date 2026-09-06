"use strict";

/*
 * The workflow gate as a whole: which files it reads, whether it consults
 * actionlint, and that it can be shown to fail rather than only observed
 * passing against a repository that is already correct.
 */

const assert = require("node:assert/strict");
const test = require("node:test");

const load = () => import("../../../tools/lint/workflow-rules.mjs");

const PINNED = "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1";

test("the gate reads the workflows it was given", async () => {
    // Driven against fixtures, so it can be shown to fail rather than only
    // observed passing against a repository that is already correct.
    const { checkWorkflows } = await load();

    await assert.rejects(
        () => checkWorkflows({
            available: false,
            files: ["bad.yml"],
            read: () => Promise.resolve("- uses: actions/checkout@v4\n")
        }),
        /must be pinned to a commit SHA/u
    );

    assert.match(
        await checkWorkflows({
            available: false,
            files: ["good.yml"],
            read: () => Promise.resolve(`- uses: ${PINNED}\n`)
        }),
        /1 workflows/u
    );
});

test("whether actionlint runs is decided by asking, not by an option", async () => {
    // `options.available ?? hasActionlint()` becoming `&&` would leave
    // actionlint permanently skipped in production, where no option is
    // passed — and the gate would still report success.
    const { checkWorkflows } = await load();
    const asked = [];
    const result = await checkWorkflows({
        files: ["good.yml"],
        read: () => Promise.resolve(`- uses: ${PINNED}\n`),
        probe: () => {
            asked.push("probed");

            throw new Error("shellcheck-style absence");
        }
    });

    assert.deepEqual(asked, ["probed"], "the probe must be consulted");
    assert.match(result, /actionlint not installed, skipped/u);
});

test("an explicit availability still overrides the probe", async () => {
    const { checkWorkflows } = await load();

    assert.match(
        await checkWorkflows({
            available: false,
            files: ["good.yml"],
            read: () => Promise.resolve(`- uses: ${PINNED}\n`),
            probe: () => {
                throw new Error("must not be consulted");
            }
        }),
        /not installed, skipped/u
    );
});

test("multiple spaces anywhere in the line do not hide an action", async () => {
    // YAML tolerates them, so the gate has to as well.
    const { unpinnedActions } = await load();

    assert.deepEqual(unpinnedActions("  -   uses:   a/b@v1\n"), ["a/b@v1"]);
    assert.deepEqual(unpinnedActions("-\tuses:\ta/b@v1\n"), ["a/b@v1"]);
});

test("a comment that mentions uses is not an action", async () => {
    // Unanchored, the scanner would read the word out of prose and refuse a
    // workflow for something that is not a step at all.
    const { unpinnedActions } = await load();

    assert.deepEqual(unpinnedActions("      # uses: actions/checkout@v4\n"), []);
    assert.deepEqual(
        unpinnedActions("      # explains why it uses: nothing\n"),
        []
    );
});

test("a commit pin must be the whole reference", async () => {
    // Trailing characters after forty hex digits are not a longer commit;
    // they are something else wearing one.
    const { unpinnedActions } = await load();
    const sha = "3d3c42e5aac5ba805825da76410c181273ba90b1";

    assert.deepEqual(unpinnedActions(`- uses: a/b@${sha}\n`), []);
    assert.deepEqual(unpinnedActions(`- uses: a/b@${sha}x\n`), [`a/b@${sha}x`]);
});
