"use strict";

/*
 * What a removed comment takes with it. Nothing here reads a line it does not
 * already own: the whitespace around a comment is outside every literal by
 * construction, while collapsing blank lines afterwards would read every line
 * in the file -- including the ones inside a multi-line template literal,
 * where a blank line is a character of somebody's output.
 */

const assert = require("node:assert/strict");
const test = require("node:test");

const load = () => import("../../../tools/strip-comments.mjs");
const loadRelease = () => import("../../../tools/release.mjs");

// The target the artifact is held to, taken from where it is declared rather
// than copied: parsed as an older ECMAScript, newer syntax is a syntax error.
async function options(kept) {
    const { ECMASCRIPT_TARGET } = await loadRelease();

    return { ecmaVersion: ECMASCRIPT_TARGET, kept };
}

test("a comment that had a line to itself takes the line with it", async () => {
    const { stripComments } = await load();
    const source = [
        "/* banner */",
        "const value = 1;",
        "// a line comment",
        "/*",
        " * a block comment",
        " */",
        "const other = 2;"
    ].join("\n");

    assert.equal(stripComments(source, await options()), [
        "/* banner */",
        "const value = 1;",
        "const other = 2;"
    ].join("\n"));
});

test("blank lines the source wrote are left where they were", async () => {
    // Nothing here reads a line it does not already own. The alternative --
    // collapsing runs of blank lines afterwards -- reads every line in the
    // file, including the ones inside a multi-line template literal, where a
    // blank line is a character of somebody's output.
    const { stripComments } = await load();
    const source = [
        "/* banner */",
        "const template = `a",
        "",
        "",
        "b`;",
        "",
        "// dropped",
        "",
        "const value = 1;"
    ].join("\n");

    assert.equal(stripComments(source, await options()), [
        "/* banner */",
        "const template = `a",
        "",
        "",
        "b`;",
        "",
        "",
        "const value = 1;"
    ].join("\n"));
});

test("a trailing comment goes without taking its code with it", async () => {
    const { stripComments } = await load();

    assert.equal(
        stripComments(
            "/* b */\nconst value = 1; // why\nconst other = 2;",
            await options()
        ),
        "/* b */\nconst value = 1;\nconst other = 2;"
    );
});

test("the whitespace a comment sat behind goes with it, tab or space", async () => {
    // Left behind it is trailing whitespace, which this repository refuses
    // everywhere else and would now be shipping in the artifact.
    const { stripComments } = await load();
    const stripping = await options();

    for (const gap of [" ", "\t", " \t "]) {
        assert.equal(
            stripComments(`/* b */\nconst value = 1;${gap}// why\n`, stripping),
            "/* b */\nconst value = 1;\n",
            JSON.stringify(gap)
        );
    }
});

test("a block comment sharing its line with code leaves the code alone", async () => {
    const { stripComments } = await load();
    const stripping = await options();

    // The comment starts the line, so the gap after it goes with it --
    // whatever that gap is made of.
    for (const gap of [" ", "\t", " \t "]) {
        assert.equal(
            stripComments(`/* b */\n/* c */${gap}const value = 1;\n`, stripping),
            "/* b */\nconst value = 1;\n",
            JSON.stringify(gap)
        );
    }
    // Nothing separates them, so there is no gap to take -- and taking one
    // anyway would eat the first character of the code.
    assert.equal(
        stripComments("/* b */\n/* c */const value = 1;\n", stripping),
        "/* b */\nconst value = 1;\n"
    );
    // Code first: the line is not the comment's to take.
    assert.equal(
        stripComments("/* b */\nconst value = 1; /* c */\nnext();\n", stripping),
        "/* b */\nconst value = 1;\nnext();\n"
    );
});

test("a comment ending a file without a final newline still goes", async () => {
    const { stripComments } = await load();

    assert.equal(
        stripComments("/* b */\nconst value = 1;\n// last", await options()),
        "/* b */\nconst value = 1;\n"
    );
});
