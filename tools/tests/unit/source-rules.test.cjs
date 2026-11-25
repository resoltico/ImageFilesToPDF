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

    assert.doesNotThrow(() => checkContent("a.js", "function f(x) {\n\tif (x) {\n\t\treturn 1;\n\t}\n}\n"));
});

test("cohesive sources have no physical line cap", async () => {
    const { checkContent } = await loadRules();
    assert.doesNotThrow(() => checkContent("a.js", "// a cohesive source\n".repeat(200)));
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

test("an ESLint directive must name its rules and give a reason", async () => {
    const { directiveProblems } = await import("../../../tools/lint/source-rules.mjs");
    const of = (...texts) => directiveProblems(texts.map((text) => ({ text })));
    assert.deepEqual(of(" eslint-disable-next-line no-bitwise -- Flags are bitmasks."), []);
    assert.deepEqual(of(" eslint-disable no-magic-numbers, no-bitwise -- Format constants."), []);
    assert.deepEqual(of(" eslint-enable no-magic-numbers"), []);
    assert.deepEqual(of(" ordinary comment about eslint-disable directives"), []);
    assert.deepEqual(of(" eslint-disable-next-line no-bitwise"), ['eslint-disable-next-line no-bitwise gives no "-- reason"']);
    assert.deepEqual(of(" eslint-disable-line no-console --"), ['eslint-disable-line no-console -- gives no "-- reason"']);
    assert.deepEqual(of(" eslint-disable -- Everything, because."), ["eslint-disable names no rule"]);
    assert.deepEqual(of(" eslint-disable"), ["eslint-disable names no rule"]);
});

test("a source file with a reasonless directive is refused", async () => {
    const { checkContent } = await import("../../../tools/lint/source-rules.mjs");
    assert.throws(() => checkContent("src/x.js", "// eslint-disable-next-line no-bitwise\nconst a = 1 | 2;\n"), /src\/x\.js: .*gives no "-- reason"/u);
    assert.throws(() => checkContent("tools/x.mjs", "import a from \"a\";\n/* eslint-disable */\n"), /tools\/x\.mjs: eslint-disable names no rule/u);
    assert.doesNotThrow(() => checkContent("README.md", "<!-- eslint-disable -->\n"));
});
