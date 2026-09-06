"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

/*
 * The action's external surface is written down in one module, and this rule
 * is what keeps it there. Named anywhere else, the surface has to be
 * reassembled by reading five files, which is how it drifted out of anyone's
 * view before.
 */
const loadRules = () => import("../../../tools/lint/source-rules.mjs");

test("a production module may not name an executable directly", async () => {
    const { checkContent } = await loadRules();

    assert.throws(
        () => checkContent("src/runtime/pages.js", 'runArgv(a, ["/bin/cp", x]);\n'),
        // Named in full: the whole point is to say where it does belong.
        new RegExp(
            "src/runtime/pages\\.js: names /bin/cp directly; every executable " +
            "belongs in src/core/executables\\.js, which is the one place " +
            "the action.s external surface is written down",
            "u"
        )
    );
    assert.throws(
        () => checkContent(
            "src/core/commands.js",
            'const tool = "/opt/homebrew/bin/ghostscript";\n'
        ),
        /ghostscript/u
    );
});

test("the module that owns them may name them, and tests may too", async () => {
    const { checkContent } = await loadRules();

    assert.doesNotThrow(
        () => checkContent("src/core/executables.js", 'const MV = "/bin/mv";\n')
    );
    // A fixture path in a test is an assertion, not an invocation.
    assert.doesNotThrow(
        () => checkContent(
            "tests/unit/core/commands.test.cjs",
            'buildArgv("/opt/homebrew/bin/vips");\n'
        )
    );
});

test("every executable named in a file is reported, not just the first", async () => {
    const { executablePathsIn } = await loadRules();

    assert.deepEqual(
        executablePathsIn('["/usr/bin/stat", "/bin/mv", "/usr/bin/stat"]'),
        ["/bin/mv", "/usr/bin/stat"],
        "deduplicated, and in a fixed order rather than the order found"
    );
    assert.deepEqual(executablePathsIn("no paths here"), []);
    // A path that is not an executable location is not one of these.
    assert.deepEqual(executablePathsIn('"/Users/someone/photo.png"'), []);
});

test("a production module with no executable in it passes", async () => {
    // Without this, the rule could reject every file under src/ and the other
    // tests would still pass: each of them either expects a rejection or
    // takes the early return for a path outside src/.
    const { checkContent } = await loadRules();

    assert.doesNotThrow(
        () => checkContent("src/runtime/pages.js", "const value = 1;\n")
    );
    assert.doesNotThrow(
        () => checkContent("src/core/geometry.js", 'const label = "output";\n')
    );
});

test("a file naming several is told about all of them, as a list", async () => {
    const { checkContent } = await loadRules();

    // Run together, "/bin/cp/bin/mv" is a path that does not exist and a
    // reader looks for the wrong thing.
    assert.throws(
        () => checkContent("src/runtime/pages.js", '["/bin/cp", "/bin/mv"]\n'),
        /names \/bin\/cp, \/bin\/mv directly/u
    );
});
