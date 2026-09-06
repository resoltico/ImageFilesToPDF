"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

/*
 * tools/bundle.mjs produces the shipped artifact. Its duplicate-declaration
 * and dependency-order checks are the only thing standing between a bad edit
 * and a single-scope bundle that breaks on a user's Mac, so they are tested
 * directly rather than only through the macOS integration run.
 */
const loadBundle = () => import("../../../tools/bundle.mjs");
const ROOT = "/repo";

test("require and export lines are stripped, leaving the body", async () => {
    const { stripModuleSyntax } = await loadBundle();
    const source = [
        '"use strict";',
        "",
        'const { a } = require("./other.js");',
        "",
        "function thing() {",
        "    return a;",
        "}",
        "",
        "module.exports = { thing };",
        ""
    ].join("\n");
    const body = stripModuleSyntax(
        source,
        "src/core/x.js",
        new Set(["src/core/other.js"]),
        ROOT
    );

    assert.equal(body, "function thing() {\n    return a;\n}");
});

test("a multi-line require is stripped too", async () => {
    const { stripModuleSyntax } = await loadBundle();
    const source = [
        '"use strict";',
        "",
        "const {",
        "    a,",
        "    b",
        '} = require("./other.js");',
        "",
        "const value = 1;",
        "",
        "module.exports = { value };",
        ""
    ].join("\n");

    assert.equal(
        stripModuleSyntax(source, "src/core/x.js", new Set(["src/core/other.js"]), ROOT),
        "const value = 1;"
    );
});

test("a dependency not yet bundled is rejected", async () => {
    const { stripModuleSyntax } = await loadBundle();
    const source = 'const { a } = require("./later.js");\n\nmodule.exports = { a };\n';

    assert.throws(
        () => stripModuleSyntax(source, "src/core/x.js", new Set(), ROOT),
        /requires \.\/later\.js, which is not bundled before it/u
    );
});

test("an unrecognised require or export is not silently shipped", async () => {
    const { stripModuleSyntax } = await loadBundle();

    assert.throws(
        () => stripModuleSyntax('const a = require("./x.js");\n', "src/core/x.js", new Set(), ROOT),
        /unrecognised require survived bundling/u
    );
    assert.throws(
        () => stripModuleSyntax("module.exports.thing = 1;\n", "src/core/x.js", new Set(), ROOT),
        /unrecognised export survived bundling/u
    );
});

test("duplicate top-level names across modules are rejected", async () => {
    const { recordDeclarations } = await loadBundle();
    const declarations = new Map();

    recordDeclarations("function shared() {}", "src/core/a.js", declarations);

    assert.throws(
        () => recordDeclarations("const shared = 1;", "src/core/b.js", declarations),
        /duplicate top-level declaration "shared" in src\/core\/b\.js and src\/core\/a\.js/u
    );
});

test("every kind of top-level declaration is recorded", async () => {
    const { recordDeclarations } = await loadBundle();
    const declarations = new Map();

    recordDeclarations(
        "function fn() {}\nconst c = 1;\nlet l = 2;\nvar v = 3;",
        "src/core/a.js",
        declarations
    );

    assert.deepEqual([...declarations.keys()], ["fn", "c", "l", "v"]);
});

test("indented declarations are not mistaken for top-level ones", async () => {
    const { recordDeclarations } = await loadBundle();
    const declarations = new Map();

    recordDeclarations(
        "function outer() {\n    const inner = 1;\n    return inner;\n}",
        "src/core/a.js",
        declarations
    );

    assert.deepEqual([...declarations.keys()], ["outer"]);
});
