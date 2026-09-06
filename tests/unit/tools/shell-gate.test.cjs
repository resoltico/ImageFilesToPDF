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
