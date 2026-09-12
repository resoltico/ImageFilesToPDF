"use strict";

/*
 * What a name means once the modules are one file.
 *
 * This rule exists because the artifact failed on a real Mac while every
 * check here passed. `const { close: closeWindow } = require("./x.js")` reads
 * perfectly, runs perfectly under Node, survives the bundler's residual check
 * -- there is no require left and no export left -- and produces an artifact
 * that raises "Can't find variable: closeWindow" on the first call, because
 * the concatenated scope only ever had `close`.
 */

const assert = require("node:assert/strict");
const test = require("node:test");

const loadCommonJs = () => import("../../../tools/commonjs.mjs");
const loadBindings = () => import("../../../tools/bindings.mjs");
const loadJavaScript = () => import("../../../tools/javascript.mjs");
const ES = 2022;

async function syntaxReader() {
    const { moduleSyntaxIn } = await loadCommonJs();
    const { parseScript } = await loadJavaScript();

    return (source) => moduleSyntaxIn(parseScript(source, ES));
}

async function patternReader() {
    const { parseScript } = await loadJavaScript();

    return (source) => parseScript(source, ES).body[0].declarations[0].id;
}

test("a require that renames a binding is refused, and says which", async () => {
    const syntaxIn = await syntaxReader();

    assert.throws(
        () => syntaxIn('const { close: closeWindow } = require("./panel-window.js");'),
        /renames close to closeWindow/u
    );
});

test("the message says where the name has to be fixed", async () => {
    const syntaxIn = await syntaxReader();

    assert.throws(() => syntaxIn('const { a: b } = require("./c.js");'), (error) => {
        assert.match(error.message, /the require of \.\/c\.js/u);
        assert.match(error.message, /the bundle shares one scope/u);
        assert.match(error.message, /the only name available is the one the other module declared/u);
        assert.match(error.message, /rename it at the source instead/u);

        return true;
    });
});

test("a binding that is not a plain name is refused too", async () => {
    // A default, a rest element and a nested pattern all name something the
    // bundle does not have, for the same reason a rename does.
    const { assertPlainBindings } = await loadBindings();
    const patternOf = await patternReader();
    const patterns = [
        'const { a = 1 } = require("./c.js");',
        'const { ...rest } = require("./c.js");',
        'const { a: { b } } = require("./c.js");'
    ];

    for (const source of patterns) {
        assert.throws(
            () => assertPlainBindings(patternOf(source), "./c.js"),
            /is not a plain binding/u,
            source
        );
    }
});

test("the ordinary form passes untouched", async () => {
    const syntaxIn = await syntaxReader();

    assert.deepEqual(
        syntaxIn('const { a, b } = require("./c.js");').requires,
        ["./c.js"]
    );
});
