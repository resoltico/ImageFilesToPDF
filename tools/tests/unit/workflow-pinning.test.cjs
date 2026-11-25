"use strict";

/*
 * Actions must be pinned to a commit.
 *
 * A tag is a moveable label: whoever owns the action repository can point v4
 * at different code tomorrow, and it would run with whatever permissions the
 * job holds. The repository has pinned by SHA from the start and dependabot
 * keeps the pins current — but nothing checked it, so a single unpinned line
 * would have gone in unnoticed.
 */

const assert = require("node:assert/strict");
const test = require("node:test");

const load = () => import("../../../tools/lint/workflow-rules.mjs");

const PINNED = "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1";

test("a commit-pinned action is accepted", async () => {
    const { unpinnedActions } = await load();

    assert.deepEqual(unpinnedActions(`      - uses: ${PINNED}\n`), []);
});

test("a tag, a branch or a bare name is refused", async () => {
    const { unpinnedActions } = await load();
    const loose = [
        "actions/checkout@v4",
        "actions/checkout@main",
        "actions/checkout",
        "actions/checkout@v4.1.1",
        // Short SHAs are ambiguous and can be made to collide.
        "actions/checkout@3d3c42e"
    ];

    for (const action of loose) {
        assert.deepEqual(
            unpinnedActions(`      - uses: ${action}\n`),
            [action],
            `${action} must be refused`
        );
    }
});

test("a local action is part of this repository and needs no pin", async () => {
    const { unpinnedActions } = await load();

    assert.deepEqual(unpinnedActions("      - uses: ./.github/actions/build\n"), []);
});

test("every form the file uses is seen", async () => {
    // Both the list-item form and the keyed form appear in these workflows.
    const { unpinnedActions } = await load();

    assert.deepEqual(
        unpinnedActions("      - uses: a/b@v1\n        uses: c/d@v2\n"),
        ["a/b@v1", "c/d@v2"]
    );
});

test("the failure names the file and every loose action", async () => {
    const { assertPinned } = await load();

    assert.throws(
        () => assertPinned("release.yml", "- uses: a/b@v1\n- uses: c/d@main\n"),
        (error) => {
            assert.match(error.message, /release\.yml/u);
            assert.match(error.message, /a\/b@v1, c\/d@main/u, "separated");

            return true;
        }
    );
});

test("a fully pinned workflow raises nothing", async () => {
    const { assertPinned } = await load();

    assert.doesNotThrow(() => assertPinned("quality.yml", `- uses: ${PINNED}\n`));
});

test("a workflow is read as text, from where workflows live", async () => {
    // As bytes, every pinning pattern matches nothing and each workflow looks
    // perfectly pinned.
    const { readWorkflow } = await load();
    const calls = [];

    await readWorkflow("quality.yml", (...args) => calls.push(args));
    assert.equal(calls.length, 1);
    assert.match(calls[0][0], /\.github\/workflows\/quality\.yml$/u);
    assert.equal(calls[0][1], "utf8");
});

test("a floating runner label is refused and a named one passes", async () => {
    const { assertRunnersPinned, floatingRunners } = await import("../../../tools/lint/workflow-rules.mjs");
    const text = "jobs:\n  a:\n    runs-on: ubuntu-latest\n  b:\n    runs-on: ubuntu-24.04\n  c:\n    runs-on: windows-latest\n  d:\n    runs-on: macos-26\n";
    assert.deepEqual(floatingRunners(text), ["runs-on: ubuntu-latest", "runs-on: windows-latest"]);
    assert.throws(() => assertRunnersPinned("w.yml", text), /w\.yml: runner images must be named, not floating: runs-on: ubuntu-latest, runs-on: windows-latest/u);
    assert.doesNotThrow(() => assertRunnersPinned("w.yml", "    runs-on: macos-26\n"));
});
