"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { fakeRepo, loadConsistency } = require("./fake-repo.cjs");

test("agreeing values are accepted and returned", async () => {
    const { assertAll } = await loadConsistency();

    assert.equal(
        assertAll("versions", [
            ["package.json", "0.3.0"],
            ["INSTALL.txt", "0.3.0"],
            ["CHANGELOG.md", "0.3.0"]
        ]),
        "0.3.0"
    );
});

test("a single disagreement is rejected and located", async () => {
    const { assertAll } = await loadConsistency();

    assert.throws(
        () => assertAll("versions", [
            ["package.json", "0.3.0"],
            ["INSTALL.txt", "0.2.0"]
        ]),
        (error) => {
            // One file per line: run together they read as a single value
            // rather than as a disagreement between two.
            assert.equal(
                error.message,
                "versions disagree between files:\n"
                + "  package.json: 0.3.0\n"
                + "  INSTALL.txt: 0.2.0"
            );

            return true;
        }
    );
});

test("agreeing version declarations are accepted", async () => {
    const { checkVersion } = await loadConsistency();

    assert.equal(await checkVersion(fakeRepo()), "1.2.3");
});

test("agreeing Node declarations are accepted", async () => {
    const { checkNodeVersion } = await loadConsistency();

    assert.equal(await checkNodeVersion(fakeRepo()), "26.8.1");
});

test("each file that states the Node version is compared", async () => {
    const { checkNodeVersion } = await loadConsistency();
    const disagreements = {
        ".node-version": "24.0.0\n",
        "mise.toml": '[tools]\nnode = "24.0.0"\n',
        "package.json": JSON.stringify({
            version: "1.2.3",
            engines: { node: ">=24.0.0" }
        })
    };

    await Promise.all(Object.entries(disagreements).map(([file, content]) =>
        assert.rejects(
            () => checkNodeVersion(fakeRepo({ [file]: content })),
            /Node versions disagree between files/u,
            `${file} disagreeing must be caught`
        )));
});

test("checkConsistency summarises every fact it agreed", async () => {
    const { checkConsistency } = await loadConsistency();

    assert.equal(
        await checkConsistency(fakeRepo()),
        "version 1.2.3, node 26.8.1, https://github.com/someone/Project"
    );
});

test("a file that no longer states the fact is an error", async () => {
    const { checkVersion, checkNodeVersion } = await loadConsistency();

    await assert.rejects(
        () => checkVersion(fakeRepo({ "INSTALL.txt": "no version here" })),
        /could not find the declared value in INSTALL\.txt/u
    );
    await assert.rejects(
        () => checkNodeVersion(fakeRepo({ "mise.toml": "[tools]\n" })),
        /could not find the declared value in mise\.toml/u
    );
});

test("a file the gate depends on going missing is explained, not thrown raw", async () => {
    // Renaming INSTALL.txt to Markdown used to surface as a bare ENOENT stack,
    // which is a confusing way to discover a convention.
    const { readFromDisk } = await loadConsistency();

    await assert.rejects(
        () => readFromDisk("INSTALL.md"),
        (error) => {
            // Whole: the point is to say what to do next, and the last
            // clause is the reason the file is not simply renamed.
            assert.equal(error.message,
                "INSTALL.md is missing, and the gate checks it for the " +
                "version or the Node pin. If it was renamed, update " +
                "tools/lint/consistency.mjs as well; INSTALL.txt in " +
                "particular is deliberately plain text.");
            assert.ok(!/ENOENT/u.test(error.message));

            return true;
        }
    );
    // Text, not bytes. readFile with a missing encoding hands back a Buffer
    // instead of throwing, and most callers coerce it without noticing —
    // until one of them calls a string method on it.
    const text = await readFromDisk("INSTALL.txt");

    assert.equal(typeof text, "string");
    assert.match(text, /IMAGE FILES TO PDF/u);
});
