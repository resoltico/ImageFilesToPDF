"use strict";

/*
 * What the ignore file must cover, and what it must never cover.
 *
 * The second half is the one that matters. dist/ holds the released artifact
 * and is committed deliberately; ignoring it would stop the committed
 * artifact updating while every local check kept passing, because check-dist
 * compares the working tree against src/ rather than against git.
 */

const assert = require("node:assert/strict");
const test = require("node:test");

const load = () => import("../../../tools/lint/ignore-rules.mjs");
const COVERED = ["node_modules/", "reports/", ".stryker-tmp/"];

test("comments and blank lines are not patterns", async () => {
    const { parseIgnore } = await load();

    assert.deepEqual(
        parseIgnore("# a note\n\nnode_modules/\n\n  reports/  \n"),
        ["node_modules/", "reports/"]
    );
});

test("a pattern matches however its slashes are written", async () => {
    const { ignoresPath } = await load();

    for (const pattern of ["dist", "dist/", "/dist", "/dist/"]) {
        assert.equal(
            ignoresPath([pattern], "dist/"),
            true,
            `${pattern} ignores dist/`
        );
    }

    assert.equal(ignoresPath(["distant/"], "dist/"), false, "not a prefix match");
});

test("a later negation wins, as it does in git", async () => {
    const { ignoresPath } = await load();

    assert.equal(ignoresPath(["dist/", "!dist/"], "dist/"), false);
    assert.equal(ignoresPath(["!dist/", "dist/"], "dist/"), true);
});

test("everything the toolchain generates must be covered", async () => {
    const { checkIgnoreRules } = await load();

    assert.equal(checkIgnoreRules(COVERED), COVERED.length);

    for (const missing of COVERED) {
        assert.throws(
            () => checkIgnoreRules(COVERED.filter((path) => path !== missing)),
            new RegExp(`does not cover them: ${missing.replace(".", "\\.")}`, "u"),
            `${missing} must be required`
        );
    }
});

test("dist must never be ignored, however it is spelled", async () => {
    // Ignoring it would stop the released artifact updating while check-dist
    // kept passing, and the next release would ship a stale file.
    const { checkIgnoreRules } = await load();

    for (const pattern of ["dist", "dist/", "/dist"]) {
        assert.throws(
            () => checkIgnoreRules([...COVERED, pattern]),
            /committed on purpose and must not be ignored/u,
            `${pattern} must be refused`
        );
    }
});

test("dist ignored and then un-ignored is allowed", async () => {
    const { checkIgnoreRules } = await load();

    assert.equal(
        checkIgnoreRules([...COVERED, "dist/", "!dist/"]),
        COVERED.length + 2
    );
});

test("the repository's own ignore file passes", async () => {
    const { checkIgnores } = await load();

    assert.ok(await checkIgnores() > 0);
});

test("a pattern naming a nested path is matched whole", async () => {
    // Only the leading and trailing slashes are optional. Stripping slashes
    // anywhere would turn "reports/mutation/" into "reportsmutation" and stop
    // it matching anything at all.
    const { ignoresPath } = await load();

    assert.equal(ignoresPath(["reports/mutation/"], "reports/mutation/"), true);
    assert.equal(ignoresPath(["/a/b/"], "a/b"), true);
    assert.equal(ignoresPath(["a/b"], "ab"), false);
    assert.equal(ignoresPath(["reports/mutation/"], "reports/"), false);
});
