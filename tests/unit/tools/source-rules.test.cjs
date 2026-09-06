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

test("the file that is parsed is the file that is read", async () => {
    // Two paths built separately could diverge, and the gate would then be
    // parsing one file and applying its structural rules to another.
    const { checkSourceFile } = await loadRules();
    const parsed = [];

    await checkSourceFile(
        "src/core/paths.js",
        (...args) => parsed.push(args),
        (absolute, encoding) => {
            assert.equal(absolute, parsed[0][1][1], "the same path, both times");
            assert.equal(encoding, "utf8", "text, not bytes");

            return Promise.resolve("const value = 1;\n");
        }
    );

    assert.equal(parsed.length, 1);
    assert.match(parsed[0][1][1], /\/src\/core\/paths\.js$/u);
    // Inherited, so a syntax error is printed where the person running the
    // gate can read it; the running Node, so the parse is the one that counts.
    assert.deepEqual(parsed[0], [
        process.execPath,
        ["--check", parsed[0][1][1]],
        { stdio: "inherit" }
    ]);
});

test("the structural rules are applied to what was read", async () => {
    const { checkSourceFile } = await loadRules();

    await assert.rejects(
        () => checkSourceFile(
            "src/core/paths.js",
            () => undefined,
            () => Promise.resolve('const tool = "/bin/cp";\n')
        ),
        /names \/bin\/cp directly/u
    );
});
