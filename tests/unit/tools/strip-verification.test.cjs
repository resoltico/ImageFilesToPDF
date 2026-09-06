"use strict";

/*
 * What is left after stripping has to be the same program. The check is the
 * whole safety argument for touching the artifact at all, so it is asserted
 * from both sides: that it sees a difference, and that it is reached.
 */

const assert = require("node:assert/strict");
const test = require("node:test");

const load = () => import("../../../tools/strip-comments.mjs");
const loadJavaScript = () => import("../../../tools/javascript.mjs");
const loadRelease = () => import("../../../tools/release.mjs");

// Taken from where the floor is declared, not copied alongside it.
async function target() {
    const { ECMASCRIPT_TARGET } = await loadRelease();

    return ECMASCRIPT_TARGET;
}

test("what is left is the same program, token for token", async () => {
    const { stripComments } = await load();
    const { tokensOf } = await loadJavaScript();
    const ES = await target();
    const source = [
        "/* banner */",
        "// dropped",
        'const marker = "// not a comment";',
        "function run(input) { return input; } // trailing"
    ].join("\n");

    assert.deepEqual(
        tokensOf(stripComments(source, { ecmaVersion: ES }), ES),
        tokensOf(source, ES)
    );
});

test("the text is parsed at the target the artifact is held to", async () => {
    // Parsed as an older ECMAScript, newer syntax is a syntax error and the
    // build fails on a file that is perfectly valid where it runs. Private
    // fields are ES2022, which is the floor this repository declares.
    const { stripComments } = await load();
    const source =
        "/* b */\nclass Store { #value = 1; read() { return this.#value; } }\n";

    assert.equal(stripComments(source, { ecmaVersion: await target() }), source);
});

test("a stripper that changed the program would fail the build", async () => {
    // The guard, asserted directly: it is what stands between a bad edit here
    // and an artifact nobody would notice was different.
    const { assertSameProgram } = await loadJavaScript();
    const ES = await target();

    assert.doesNotThrow(() => assertSameProgram("const a = 1;", "const a = 1;", ES));
    assert.throws(
        () => assertSameProgram("const a = 1;", "const a = 2;", ES),
        (error) => {
            assert.equal(error.message, "stripping comments changed the " +
                "program: 5 tokens became 5, first difference at token 3");

            return true;
        }
    );
    // The first token counts: a difference there is still a difference.
    assert.throws(
        () => assertSameProgram("a();", "b();", ES),
        /first difference at token 0$/u
    );
    assert.throws(
        () => assertSameProgram("const a = 1;", "const a = 1; b();", ES),
        (error) => {
            assert.equal(error.message, "stripping comments changed the " +
                "program: 5 tokens became 9");

            return true;
        }
    );
});

test("the artifact is verified before it is handed back", async () => {
    // The check that the stripped text is the same program is the whole safety
    // argument, so that it runs is asserted rather than assumed.
    const { stripComments } = await load();
    const calls = [];
    const ES = await target();
    const source = "/* b */\n// dropped\nconst value = 1;\n";
    const stripped = stripComments(
        source,
        { ecmaVersion: ES },
        (...args) => calls.push(args)
    );

    assert.deepEqual(calls, [[source, stripped, ES]]);
    assert.throws(
        () => stripComments(source, { ecmaVersion: ES }, () => {
            throw new Error("not the same program");
        }),
        /not the same program/u
    );
});
