"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const loadRules = () => import("../../../tools/lint/source-rules.mjs");
const NUL = String.fromCharCode(0);
const DEL = String.fromCharCode(127);

test("well-formed content passes", async () => {
    const { checkContent } = await loadRules();

    assert.doesNotThrow(() => checkContent("a.js", "const a = 1;\n"));
});

test("a missing final newline is rejected", async () => {
    const { checkContent } = await loadRules();

    assert.throws(
        () => checkContent("a.js", "const a = 1;"),
        /a\.js: missing final newline/u
    );
});

test("trailing whitespace is rejected", async () => {
    const { checkContent } = await loadRules();

    assert.throws(
        () => checkContent("a.js", "const a = 1; \nconst b = 2;\n"),
        /trailing whitespace/u
    );
    assert.throws(
        () => checkContent("a.js", "const a = 1;\t\n"),
        /trailing whitespace/u
    );
});

test("carriage returns are rejected", async () => {
    const { checkContent } = await loadRules();

    assert.throws(
        () => checkContent("a.js", "const a = 1;\r\n"),
        /CR characters are forbidden/u
    );
});

test("a literal control character is rejected, with its position", async () => {
    // Invisible here, corrupting when pasted into the Shortcuts editor.
    const { checkContent } = await loadRules();

    assert.throws(
        () => checkContent("a.js", `const a = "x";\nconst b = "${NUL}";\n`),
        /a\.js:2: literal control character U\+0000/u
    );
    assert.throws(
        () => checkContent("a.js", `const a = "${DEL}";\n`),
        /literal control character U\+007F/u
    );
});

test("tabs and newlines are not treated as control characters", async () => {
    const { checkContent } = await loadRules();

    assert.doesNotThrow(() => checkContent("a.js", "if (x) {\n\treturn 1;\n}\n"));
});

test("a file over the size limit is rejected", async () => {
    const { checkContent, MAXIMUM_FILE_LINES } = await loadRules();
    const justUnder = `${"const a = 1;\n".repeat(MAXIMUM_FILE_LINES)}`;
    const justOver = `${"const a = 1;\n".repeat(MAXIMUM_FILE_LINES + 1)}`;

    assert.doesNotThrow(() => checkContent("a.js", justUnder));
    assert.throws(
        () => checkContent("a.js", justOver),
        /exceeds the 150-line limit; split it rather than raising the limit/u
    );
});

test("a production module may not name an executable directly", async () => {
    // The action's external surface is written down in one module. Naming a
    // binary anywhere else means the surface has to be reassembled by reading
    // five files, which is how it drifted out of anyone's view before.
    const { checkContent } = await loadRules();

    assert.throws(
        () => checkContent("src/runtime/pages.js", 'runArgv(a, ["/bin/cp", x]);\n'),
        /names \/bin\/cp directly; every executable belongs in/u
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
        executablePathsIn('["/bin/mv", "/usr/bin/stat", "/bin/mv"]'),
        ["/bin/mv", "/usr/bin/stat"]
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
