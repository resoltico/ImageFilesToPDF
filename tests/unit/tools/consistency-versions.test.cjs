"use strict";

/*
 * Where each version declaration is read from, how it is reported when they
 * disagree, and version numbers wider than one digit per component — every
 * other fixture uses 1.2.3, where a per-component `\d` and `\d+` cannot be
 * told apart.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { fakeRepo, loadConsistency } = require("./fake-repo.cjs");

test("a version component with more than one digit is read whole", async () => {
    // Every component, not just one: with 1.20.30 the leading \d and \d+
    // behave identically and the first component goes unchecked.
    // Every fixture above uses single digits, where `\d` and `\d+` behave
    // identically. 0.10.0 will happen, and truncating it to 0.1.0 would make
    // the check compare the wrong numbers while appearing to agree.
    const { checkVersion } = await loadConsistency();
    const wide = {
        "package.json": JSON.stringify({
            version: "10.20.30",
            engines: { node: ">=26.8.1" }
        }),
        "package-lock.json": JSON.stringify({
            version: "10.20.30",
            packages: { "": { version: "10.20.30" } }
        }),
        "INSTALL.txt": "IMAGE FILES TO PDF 10.20.30 - SHORTCUTS INSTALLATION",
        "CHANGELOG.md": "# Changelog\n\n## [10.20.30] - 2026-01-01\n",
        "src/core/version.js": 'const VERSION = "10.20.30";\n'
    };

    assert.equal(await checkVersion(fakeRepo(wide)), "10.20.30");
});

test("a disagreement in a later digit is still a disagreement", async () => {
    const { checkVersion } = await loadConsistency();

    await assert.rejects(
        () => checkVersion(fakeRepo({
            "INSTALL.txt": "IMAGE FILES TO PDF 1.2.30 - SHORTCUTS INSTALLATION"
        })),
        /versions disagree/u
    );
});
