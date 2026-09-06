"use strict";

/*
 * How shellcheck is invoked, and what happens when it is not there.
 *
 * The runner is a parameter throughout: shellcheck is installed on macOS
 * runners and not on Linux ones, and a test that needs it would pass on one
 * and fail on the other.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const load = () => import("../../../tools/lint/shell-rules.mjs");

function fixtureTree(files) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "shell-gate-"));

    for (const [relative, content] of Object.entries(files)) {
        const target = path.join(directory, relative);

        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, content);
    }

    test.after(() => fs.rmSync(directory, { recursive: true, force: true }));

    return directory;
}

const GOOD = "#!/bin/bash\nset -euo pipefail\necho ok\n";

test("shellcheck is given every script, by absolute path", async () => {
    // Injected rather than invoked: shellcheck is not on every machine that
    // runs this gate, and a test needing it would pass on a developer's Mac
    // and be skipped on a Linux runner, leaving the branch unexercised.
    const { checkShellScripts } = await load();
    const tree = fixtureTree({ "run.sh": GOOD, "lib/assert.sh": GOOD });
    const checked = [];

    assert.match(
        await checkShellScripts(true, tree, (paths) => checked.push(...paths)),
        /2 scripts, shellcheck passed/u
    );
    assert.equal(checked.length, 2);

    for (const file of checked) {
        assert.match(file, /^\/.*\.sh$/u, file);
    }
});

test("shellcheck findings fail the gate when it is installed", async () => {
    const { checkShellScripts, hasShellcheck } = await load();

    if (!hasShellcheck()) {
        return;
    }

    // SC2164, a warning: a cd that is not checked. Parses fine, so only
    // shellcheck sees it.
    const tree = fixtureTree({ "cd.sh": "#!/bin/bash\ncd /tmp\necho ok\n" });

    await assert.rejects(() => checkShellScripts(true, tree));

    // SC2086, an unquoted expansion, is info level. The threshold is set at
    // warning deliberately, so this must pass rather than fail the gate.
    const info = fixtureTree({ "unquoted.sh": "#!/bin/bash\nf=$1\ncat $f\n" });

    assert.equal(await checkShellScripts(true, info), "1 scripts, shellcheck passed");
    assert.equal(
        await checkShellScripts(true, fixtureTree({ "fine.sh": GOOD })),
        "1 scripts, shellcheck passed"
    );
});

test("a missing shellcheck is reported as absent, not as success", async () => {
    const { hasShellcheck } = await load();

    assert.equal(hasShellcheck(() => undefined), true);
    assert.equal(
        hasShellcheck(() => {
            throw new Error("command not found");
        }),
        false
    );
});

test("discovery order does not depend on how the directory reads back", async () => {
    const { shellScripts } = await load();
    // readdir gives no ordering guarantee, and "lib" sorts before
    // "lib-extra.sh" as a directory entry while "lib-extra.sh" sorts before
    // "lib/assert.sh" as a path. Without the sort the gate's report and the
    // arguments handed to shellcheck vary between machines.
    const tree = fixtureTree({
        "lib/assert.sh": GOOD,
        "lib-extra.sh": GOOD
    });

    assert.deepEqual(
        (await shellScripts(tree)).map((found) => path.relative(tree, found)),
        ["lib-extra.sh", "lib/assert.sh"]
    );
});

test("shellcheck is invoked at warning severity, with inherited output", async () => {
    // Below warning, shellcheck reports style notes that would fail the gate
    // for things it merely suggests. The exec is a parameter so this can be
    // asserted without shellcheck being installed.
    const { runShellcheck } = await load();
    const calls = [];

    runShellcheck(["/a/run.sh"], (...args) => calls.push(args));

    assert.deepEqual(calls, [
        ["shellcheck", ["--severity=warning", "/a/run.sh"], { stdio: "inherit" }]
    ]);
});
