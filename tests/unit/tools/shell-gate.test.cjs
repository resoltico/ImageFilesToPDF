"use strict";

/*
 * The shell half of the gate, driven against a fixture tree.
 *
 * Run only against the real repository it always passes, which says nothing
 * about whether it would catch anything. These cases hand it scripts that are
 * broken on purpose.
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

test("only .sh files are collected, recursively and in order", async () => {
    const { shellScripts } = await load();
    const tree = fixtureTree({
        "run.sh": GOOD,
        "lib/assert.sh": GOOD,
        "lib/notes.md": "not a script\n",
        "README": "nor this\n"
    });

    assert.deepEqual(
        (await shellScripts(tree)).map((found) => path.relative(tree, found)),
        ["lib/assert.sh", "run.sh"]
    );
});

test("a script that does not parse fails the gate", async () => {
    const { checkShellScripts } = await load();
    const tree = fixtureTree({ "broken.sh": "#!/bin/bash\nif true; then\n" });

    await assert.rejects(() => checkShellScripts(false, tree));
});

test("a shell script is held to the same size limit as the JavaScript", async () => {
    const { checkShellScripts } = await load();
    const tree = fixtureTree({
        "huge.sh": `#!/bin/bash\n${"echo padding\n".repeat(200)}`
    });

    await assert.rejects(
        () => checkShellScripts(false, tree),
        /exceeds the 150-line limit/u
    );
});

test("scripts are syntax checked even when shellcheck is absent", async () => {
    // The skip must apply to shellcheck alone. `bash -n` needs no install, so
    // a machine without shellcheck still gets the parse check.
    const { checkShellScripts } = await load();
    const tree = fixtureTree({ "broken.sh": "#!/bin/bash\nfor x in; do\n" });

    await assert.rejects(() => checkShellScripts(false, tree));

    const clean = fixtureTree({ "fine.sh": GOOD });

    assert.equal(
        await checkShellScripts(false, clean),
        "1 scripts (shellcheck not installed, skipped)"
    );
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
