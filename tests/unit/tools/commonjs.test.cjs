"use strict";

/*
 * What CommonJS looks like in a syntax tree.
 *
 * The bundler used to find these by matching lines, so what it recognised
 * depended on how the sources happened to be formatted. These are the shapes
 * a parser sees the same way wherever they sit.
 */

const assert = require("node:assert/strict");
const test = require("node:test");

const loadCommonJs = () => import("../../../tools/commonjs.mjs");
const loadJavaScript = () => import("../../../tools/javascript.mjs");
const ES = 2022;

// Loaded once per test, so a case can be one line inside a loop.
async function reader() {
    const { moduleSyntaxIn, declaredNames } = await loadCommonJs();
    const { parseScript } = await loadJavaScript();

    return {
        syntaxIn: (source) => moduleSyntaxIn(parseScript(source, ES)),
        namesIn: (source) => parseScript(source, ES).body.flatMap(declaredNames)
    };
}

test("a destructured require is recognised however it is written", async () => {
    // Indentation, spacing and line breaks are formatting; the statement is
    // the same statement, and the old line-matching missed two of these.
    const { syntaxIn } = await reader();

    for (const source of [
        'const { a } = require("./b.js");',
        'const {a} = require ("./b.js");',
        'const {\n    a,\n    b\n} = require(\n    "./b.js"\n);',
        'let { a } = require("./b.js");'
    ]) {
        const { requires, removed } = syntaxIn(source);

        assert.deepEqual(requires, ["./b.js"], source);
        assert.equal(removed.length, 1, source);
    }
});

test("a require the bundle cannot honour is left where it is", async () => {
    // The bundle shares one scope: a destructured name is already there, but
    // `const b = require(...)` would bind b to an exports object that does not
    // exist once the modules are concatenated. Left alone, it is refused by
    // the residual check with a message that says so.
    const { syntaxIn } = await reader();

    for (const source of [
        'const b = require("./b.js");',
        'const { a } = other;',
        'const { a } = require(name);',
        'const { a } = require(123);',
        'const { a } = require("./b.js", 2);',
        'const { a } = req("./b.js");',
        'const { a } = require.resolve("./b.js");',
        'const { a } = require("./b.js"), { c } = require("./d.js");',
        'function load() { const { a } = require("./b.js"); }'
    ]) {
        const { requires, removed } = syntaxIn(source);

        assert.deepEqual(requires, [], source);
        assert.deepEqual(removed, [], source);
    }
});

test("only the module's own exports assignment is removed", async () => {
    const { syntaxIn } = await reader();
    const { removed } = syntaxIn("module.exports = { a };");

    assert.equal(removed.length, 1);

    for (const source of [
        "module.exports.a = 1;",
        "other.exports = { a };",
        "module.other = { a };",
        "module.exports;",
        "exports = { a };",
        'module["exports"] = { a };',
        "a.module.exports = { b };"
    ]) {
        assert.deepEqual((syntaxIn(source)).removed, [], source);
    }
});

test("the directive goes, and a string that merely says the same does not", async () => {
    const { syntaxIn } = await reader();
    assert.equal((syntaxIn('"use strict";\nconst a = 1;')).removed.length, 1);
    assert.deepEqual(
        (syntaxIn('const marker = "use strict";')).removed,
        [],
        "an ordinary string is not a prologue"
    );
});

test("every name a top-level statement introduces is reported", async () => {
    const { namesIn } = await reader();
    assert.deepEqual(namesIn("function a() {}"), ["a"]);
    assert.deepEqual(namesIn("class B {}"), ["B"]);
    assert.deepEqual(namesIn("const c = 1, d = 2;"), ["c", "d"]);
    assert.deepEqual(namesIn("let e;\nvar f;"), ["e", "f"]);
    assert.deepEqual(namesIn("const { g, h: i } = j;"), ["g", "i"]);
    assert.deepEqual(namesIn("const [k, , l] = m;"), ["k", "l"]);
    assert.deepEqual(namesIn("const [{ n }] = o;"), ["n"]);
    assert.deepEqual(namesIn("thing();"), [], "a call declares nothing");
});

test("a declaration shape this cannot name is refused, not skipped", async () => {
    // A name that goes unrecorded is a collision the bundle will not catch,
    // and the bundle shares one scope.
    const { namesIn } = await reader();

    assert.throws(
        () => namesIn("const [...rest] = a;"),
        /cannot name a top-level RestElement/u
    );
});
