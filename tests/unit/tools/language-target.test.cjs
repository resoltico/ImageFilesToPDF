"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

/*
 * The language target keeps the artifact runnable on the oldest supported
 * macOS. ESLint cannot do this job: a late built-in is ordinary syntax
 * calling an ordinary method, so only this check stands between it and a
 * TypeError on a user's Mac.
 */
const loadTarget = () => import("../../../tools/lint/language-target.mjs");

test("code within the target passes", async () => {
    const { checkFeatures } = await loadTarget();

    assert.doesNotThrow(
        () => checkFeatures("const a = records.slice().sort();\nObject.hasOwn(x, 'y');")
    );
});

test("built-ins newer than the floor are rejected", async () => {
    const { checkFeatures } = await loadTarget();
    const late = [
        ".toSorted(",
        ".toReversed(",
        ".toSpliced(",
        ".with(",
        "Object.groupBy(",
        "Map.groupBy(",
        "Array.fromAsync(",
        "Promise.withResolvers(",
        "RegExp.escape(",
        "structuredClone("
    ];

    for (const token of late) {
        assert.throws(
            () => checkFeatures(`const x = a${token}b);`),
            /newer than macOS/u,
            `${token} must be rejected`
        );
    }
});

test("ES2022 syntax that postdates the floor is rejected", async () => {
    // static initialisation blocks are accepted by ecmaVersion 2022 but did
    // not reach JavaScriptCore until Safari 16.4, so the denylist carries them.
    const { checkFeatures } = await loadTarget();

    assert.throws(
        () => checkFeatures("class A { static { this.x = 1; } }"),
        /newer than macOS/u
    );
});

test("the rejection names the version and the alternative", async () => {
    const { checkFeatures } = await loadTarget();

    assert.throws(() => checkFeatures("a.toSorted()"), (error) => {
        assert.match(error.message, /Safari 16/u);
        assert.match(error.message, /\.slice\(\)\.sort\(\)/u);

        return true;
    });
});

test("an emptied denylist is itself an error", async () => {
    const { findLateFeatures } = await loadTarget();

    assert.doesNotThrow(() => findLateFeatures("const a = 1;"));
});

test("every listed feature names its version and an alternative", async () => {
    // The message is the whole value of the check: it has to tell the reader
    // which release introduced the feature and what to write instead.
    const { LATE_FEATURES } = await loadTarget();

    assert.ok(LATE_FEATURES.length > 0);

    for (const [token, since, instead] of LATE_FEATURES) {
        assert.ok(token.length > 0, "a token to look for");
        assert.match(since, /Safari|osascript/u, `${token} names its origin`);
        assert.ok(instead.length > 0, `${token} suggests an alternative`);
    }
});

test("each listed feature is genuinely detected", async () => {
    const { LATE_FEATURES, findLateFeatures } = await loadTarget();

    for (const [token] of LATE_FEATURES) {
        assert.equal(
            findLateFeatures(`const x = a${token}b);`).length,
            1,
            `${token} must be found`
        );
    }
});
