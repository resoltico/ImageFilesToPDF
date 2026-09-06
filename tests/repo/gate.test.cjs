"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

/*
 * The gate applied to the real repository. These are the entry points the
 * `npm run lint` script calls, so a break in the wiring — not just in a rule —
 * is caught here too.
 */

test("the artifact names no executable the source does not", async () => {
    // The external surface is written down in one module. This asserts the
    // artifact contains exactly what that module names, which is a property
    // of src/ that check-dist carries through to dist/.
    const { EXECUTABLES } = await import("../../src/core/executables.js");
    const { executablePathsIn } =
        await import("../../tools/lint/source-rules.mjs");
    const { renderRelease } = await import("../../tools/release.mjs");

    assert.deepEqual(executablePathsIn(await renderRelease()), [...EXECUTABLES].sort());
});

test("the committed artifact is within the language target", async () => {
    const { checkLanguageTarget } =
        await import("../../tools/lint/language-target.mjs");

    assert.match(await checkLanguageTarget(), /^ES\d{4}, macOS [\d.]+\+$/u);
});

test("a real source file passes the file rules", async () => {
    const { checkSourceFile } = await import("../../tools/lint/source-rules.mjs");

    await assert.doesNotReject(() => checkSourceFile("src/core/numbers.js"));
});

test("shell scripts are checked whether or not shellcheck is present", async () => {
    const { checkShellScripts, hasShellcheck } =
        await import("../../tools/lint/shell-rules.mjs");

    assert.equal(typeof hasShellcheck(), "boolean");
    assert.match(await checkShellScripts(false), /shellcheck not installed, skipped/u);
    assert.match(await checkShellScripts(true), /shellcheck passed/u);
});

test("a rule list that has been emptied is itself an error", async () => {
    // A guard that no longer rejects anything still reports success, which is
    // how the whole gate once passed with both lists emptied.
    const { findLateFeatures } =
        await import("../../tools/lint/language-target.mjs");

    assert.throws(
        () => findLateFeatures("anything", []),
        /no features left to reject/u
    );
});

test("hasShellcheck reports both outcomes", async () => {
    const { hasShellcheck } = await import("../../tools/lint/shell-rules.mjs");

    assert.equal(hasShellcheck(() => undefined), true);
    assert.equal(hasShellcheck(() => {
        throw new Error("not installed");
    }), false);
});

test("a consistency source that states nothing is an error", async () => {
    const { extract } = await import("../../tools/lint/consistency.mjs");

    assert.deepEqual(
        extract("version 1.2.3", /version (?<value>[\d.]+)/u, "somewhere"),
        ["somewhere", "1.2.3"]
    );
    assert.throws(
        () => extract("nothing here", /version (?<value>[\d.]+)/u, "somewhere"),
        /could not find the declared value in somewhere/u
    );
});

test("the repository's declared facts agree with each other", async () => {
    const { checkConsistency } = await import("../../tools/lint/consistency.mjs");

    assert.match(
        await checkConsistency(),
        /^version \d+\.\d+\.\d+, node \d+\.\d+\.\d+$/u
    );
});

test("the repository's own workflows pass actionlint", async () => {
    const { checkWorkflows, hasActionlint } =
        await import("../../tools/lint/workflow-rules.mjs");

    // Exercises the real probe, not an injected one.
    assert.equal(typeof hasActionlint(), "boolean");
    assert.match(await checkWorkflows(), /^\d+ workflows/u);
});
