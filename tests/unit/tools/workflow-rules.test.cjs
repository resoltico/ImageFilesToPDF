"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

/*
 * The workflows are the one part of this project that has never executed, so
 * a mistake in them would surface on a first push rather than in the gate.
 */
const loadWorkflowRules = () => import("../../../tools/lint/workflow-rules.mjs");

test("workflow files are recognised by extension", async () => {
    const { isWorkflow } = await loadWorkflowRules();

    assert.equal(isWorkflow("quality.yml"), true);
    assert.equal(isWorkflow("release.yaml"), true);
    assert.equal(isWorkflow("quality.yml.bak"), false);
    assert.equal(isWorkflow("notes.md"), false);
    assert.equal(isWorkflow("yml"), false);
});

test("finding no workflows is an error, not a pass", async () => {
    const { assertWorkflowsFound } = await loadWorkflowRules();

    assert.throws(() => assertWorkflowsFound([]), /no workflows found/u);
    assert.doesNotThrow(() => assertWorkflowsFound(["quality.yml"]));
});

test("actionlint availability is reported either way", async () => {
    const { hasActionlint } = await loadWorkflowRules();

    assert.equal(hasActionlint(() => undefined), true);
    assert.equal(hasActionlint(() => {
        throw new Error("not installed");
    }), false);
});

test("the check reports what it did, installed or not", async () => {
    // The runner is injected rather than invoked: actionlint is not present
    // on every machine that runs this gate, and a test that needs it would
    // pass on a developer's Mac and fail on a Linux runner.
    const { checkWorkflows } = await loadWorkflowRules();
    const linted = [];

    assert.match(
        await checkWorkflows({ available: false }),
        /workflows \(actionlint not installed, skipped\)/u
    );
    assert.match(
        await checkWorkflows({
            available: true,
            run: (files) => linted.push(...files)
        }),
        /workflows, actionlint passed/u
    );
    assert.ok(linted.length > 0, "actionlint must be given the workflows");
});

test("actionlint is given every workflow, by absolute path", async () => {
    // A relative path would resolve against the process's directory rather
    // than the repository, and actionlint would report on nothing.
    const { checkWorkflows } = await loadWorkflowRules();
    const linted = [];

    await checkWorkflows({
        available: true,
        files: ["quality.yml", "release.yml"],
        read: () => Promise.resolve(""),
        run: (files) => linted.push(...files)
    });

    assert.equal(linted.length, 2);

    for (const file of linted) {
        assert.match(file, /^\/.*\.github\/workflows\/\w+\.yml$/u, file);
    }
});

test("only workflow files are selected, in a stable order", async () => {
    const { selectWorkflows } = await loadWorkflowRules();

    // Anything else in the directory must not be handed to actionlint, and
    // the order must not depend on how the filesystem happened to list it.
    assert.deepEqual(
        selectWorkflows(["release.yml", "notes.md", "quality.yml", "old.yml.bak"]),
        ["quality.yml", "release.yml"]
    );
    assert.deepEqual(selectWorkflows([]), []);
});

test("an empty workflow directory fails the check", async () => {
    const { checkWorkflows } = await loadWorkflowRules();

    await assert.rejects(() => checkWorkflows({ available: false, files: [] }), /no workflows found/u);
    assert.match(await checkWorkflows({ available: false, files: ["quality.yml"] }), /1 workflows/u);
});

test("actionlint is invoked by name, with the workflows and inherited output", async () => {
    // The default runner takes its exec so this can be asserted anywhere,
    // not only on a machine that has actionlint installed.
    const { runActionlint } = await loadWorkflowRules();
    const calls = [];

    runActionlint(["/a/quality.yml"], (...args) => calls.push(args));

    assert.deepEqual(calls, [
        ["actionlint", ["/a/quality.yml"], { stdio: "inherit" }]
    ]);
});
