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

test("checkConsistency summarizes every fact it agreed", async () => {
    const { checkConsistency } = await loadConsistency();

    assert.equal(
        await checkConsistency(fakeRepo()),
        "version 1.2.3, node 26.8.1, npm 12.2.2, pdfcpu 0.16.4, macOS 13.5+, https://github.com/someone/Project"
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

test("the Node floor must be stated exactly as >=x.y.z, which the product reads", async () => {
    const { checkNodeVersion } = await loadConsistency();
    for (const node of ["^26.8.1", ">=26.8", ">= 26.8.1"]) {
        await assert.rejects(() => checkNodeVersion(fakeRepo({ "package.json": JSON.stringify({ version: "1.2.3", engines: { node } }) })),
            /engines\.node must be ">=x\.y\.z"/u, node);
    }
});

test("the npm pin and the npm engine must agree", async () => {
    const { checkNpmVersion } = await loadConsistency();
    assert.equal(await checkNpmVersion(fakeRepo()), "12.2.2");
    await assert.rejects(() => checkNpmVersion(fakeRepo({ "package.json": JSON.stringify({ engines: { node: ">=26.8.1", npm: ">=11.0.0" }, packageManager: "npm@12.2.2" }) })),
        /npm versions disagree/u);
});

test("CI installs exactly the oldest pdfcpu accepted, on Linux and Windows", async () => {
    const { checkPdfcpuVersion } = await loadConsistency();
    assert.equal(await checkPdfcpuVersion(fakeRepo()), "0.16.4");
    await assert.rejects(() => checkPdfcpuVersion(fakeRepo({ "tests/integration/windows-tools.ps1": "https://github.com/pdfcpu/pdfcpu/releases/download/v0.17.0/x.zip\n" })),
        /pdfcpu versions disagree[\s\S]*windows-tools\.ps1: 0\.17\.0/u);
    await assert.rejects(() => checkPdfcpuVersion(fakeRepo({ "tests/integration/windows-tools.ps1": "no download here\n" })),
        /could not find the declared value in tests\/integration\/windows-tools\.ps1/u);
});

test("a floor a document states must be its owner's, and a measurement is not a claim", async () => {
    const { checkStatedFloors } = await loadConsistency();
    assert.deepEqual(await checkStatedFloors(fakeRepo()), { "Node.js": "26.8.1", pdfcpu: "0.16.4", macOS: "13.5", Safari: "16.6" });
    const stale = (text) => fakeRepo({ "HEADLESS.md": text });
    for (const [text, subject] of [["Node.js 24.0.0 or later", "Node.js"], ["Node.js 24.0.0+", "Node.js"], ["pdfcpu 0.15.0 or newer", "pdfcpu"],
        ["macOS 12.0 or later", "macOS"], ["Safari 15.4", "Safari"], ["below the 24.0.0 minimum", "Node.js"]]) {
        await assert.rejects(() => checkStatedFloors(stale(text)), new RegExp(`${subject.replace(".", "\\.")} floors disagree[\\s\\S]*HEADLESS\\.md`, "u"), text);
    }
    const changelog = "# Changelog\n\n## [Unreleased]\n\n- Requires Node.js 24.0.0+.\n\n## [1.2.3] - 2026-01-01\n\n- Required Node.js 20.0.0+.\n";
    await assert.rejects(() => checkStatedFloors(fakeRepo({ "CHANGELOG.md": changelog })), /CHANGELOG\.md \(Unreleased\): 24\.0\.0/u);
    const released = "# Changelog\n\n## [1.2.3] - 2026-01-01\n\n- Required Node.js 20.0.0+.\n";
    await assert.doesNotReject(() => checkStatedFloors(fakeRepo({ "CHANGELOG.md": released })), "history keeps the floors it had");
});

test("a kind of floor claim no document makes any more fails, so rewording cannot turn the check off", async () => {
    const { checkStatedFloors } = await loadConsistency();
    await assert.rejects(() => checkStatedFloors(fakeRepo({ "README.md": "Source: https://github.com/someone/Project\n" })), /no document states the/u);
});

test("the documents name the data locations the product uses", async () => {
    const { checkDataLocations } = await loadConsistency();
    assert.deepEqual(await checkDataLocations(fakeRepo()), ["com.someone.Project", "Project", "project"]);
    const owner = 'const DATA_FOLDER = "Renamed";\nconst STATE_FOLDER = "project";\nconst PREFERENCES_DOMAIN = "com.someone.Project";\n';
    await assert.rejects(() => checkDataLocations(fakeRepo({ "src/core/data-locations.js": owner })), /data folders disagree[\s\S]*QA\.md: Project/u);
    await assert.rejects(() => checkDataLocations(fakeRepo({ "INSTALL.txt": "IMAGE FILES TO PDF 1.2.3\n    defaults delete com.other.App\n" })),
        /preferences domains disagree/u);
});
