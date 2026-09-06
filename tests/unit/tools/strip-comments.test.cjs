"use strict";

/*
 * The comment stripper runs on every build, so a mistake in it ships. These
 * are the cases where a regex stripper goes wrong and a parser simply does
 * not: a comment opener is only a comment opener where the grammar says it is.
 */

const assert = require("node:assert/strict");
const test = require("node:test");

const load = () => import("../../../tools/strip-comments.mjs");
const loadJavaScript = () => import("../../../tools/javascript.mjs");
const loadRelease = () => import("../../../tools/release.mjs");

// The target the artifact is held to, taken from where it is declared rather
// than copied: parsed as an older ECMAScript, newer syntax is a syntax error.
async function options(kept) {
    const { ECMASCRIPT_TARGET } = await loadRelease();

    return { ecmaVersion: ECMASCRIPT_TARGET, kept };
}

test("a comment opener inside a literal is not a comment", async () => {
    const { stripComments } = await load();
    const source = [
        "/* banner */",
        'const slashes = "// not a comment";',
        "const characterClass = /[/*]/u;",
        "const template = `/* not a comment */`;",
        'const url = "https://example.com//path";',
        "const division = 6 / 2 / 1;"
    ].join("\n");

    assert.equal(stripComments(source, await options()), source);
});

test("stripping twice changes nothing the second time", async () => {
    const { stripComments } = await load();
    const source = "/* b */\n\n// one\n\n// two\n\nconst value = 1;\n";
    const once = stripComments(source, await options());

    assert.equal(stripComments(once, await options()), once);
});

test("every comment in the text is found, and only comments", async () => {
    const { commentsIn } = await loadJavaScript();
    const { ECMASCRIPT_TARGET } = await loadRelease();
    const found = commentsIn(
        '/* one */\n// two\nconst marker = "// three";\n',
        ECMASCRIPT_TARGET
    );

    assert.deepEqual(found.map((comment) => comment.text), [" one ", " two"]);
});
