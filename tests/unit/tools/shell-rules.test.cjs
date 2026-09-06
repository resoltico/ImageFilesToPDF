"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

/*
 * The integration suite is shell, and was for a long time the one part of the
 * tree subject to no size limit at all.
 */
const loadShellRules = () => import("../../../tools/lint/shell-rules.mjs");

test("every integration script is checked, including nested ones", async () => {
    const { checkShellScripts } = await loadShellRules();
    const summary = await checkShellScripts();

    assert.match(summary, /^\d+ scripts/u);

    const count = Number(/^(?<n>\d+)/u.exec(summary).groups.n);

    assert.ok(count >= 3, `expected the lib/ scripts to be found, got ${count}`);
});

test("shell scripts are held to the same size rule, not a second copy", async () => {
    // A separate implementation would drift; the rule is one rule.
    const { readFile } = await import("node:fs/promises");
    const shellSource = await readFile("tools/lint/shell-rules.mjs", "utf8");

    assert.match(shellSource, /from "\.\/source-rules\.mjs"/u);
    assert.match(shellSource, /checkSize\(/u);
    assert.ok(
        !/\d+-line limit/u.test(shellSource),
        "shell-rules must reuse the size assertion, not restate it"
    );
});

test("the shell-script test is anchored at the extension", async () => {
    const { isShellScript } = await loadShellRules();

    assert.equal(isShellScript("macos.sh"), true);
    assert.equal(isShellScript("lib/assert.sh"), true);
    assert.equal(isShellScript("macos.sh.bak"), false);
    assert.equal(isShellScript("notes.shell"), false);
    assert.equal(isShellScript("sh"), false);
});
