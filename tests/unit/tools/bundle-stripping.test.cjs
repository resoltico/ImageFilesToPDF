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

test("a require written with a space is still a require", async () => {
    // `require ("./a.js")` is valid JavaScript. A guard anchored to
    // non-whitespace would read straight past it and ship a bundle that
    // calls require at runtime, where there is no module system at all.
    const { stripModuleSyntax } = await loadBundle();

    assert.throws(
        () => stripModuleSyntax(
            '"use strict";\n\nconst x = require ("./a.js");\n',
            "a.js",
            new Set(),
            ROOT
        ),
        /an unrecognised require survived bundling/u
    );
});

test("the directive and the blank line after it both go", async () => {
    // Every module contributes one; left behind they would stack up as blank
    // lines through the middle of the artifact.
    const { stripModuleSyntax } = await loadBundle();
    const body = stripModuleSyntax(
        '"use strict";\n\n\nconst value = 1;\n',
        "a.js",
        new Set(),
        ROOT
    );

    assert.equal(body, "const value = 1;");
});

test("a use-strict inside a string is not a directive", async () => {
    // Only the one at the top is the module's own.
    const { stripModuleSyntax } = await loadBundle();
    const body = stripModuleSyntax(
        '"use strict";\n\nconst marker = \'"use strict";\';\n',
        "a.js",
        new Set(),
        ROOT
    );

    assert.ok(body.includes('\'"use strict";\''), body);
});
