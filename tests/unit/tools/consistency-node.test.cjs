"use strict";

/*
 * The Node pin, which three files state and which must agree across all of
 * them — and, when it does not, must say which one is the odd one out.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { fakeRepo, loadConsistency } = require("./fake-repo.cjs");

test("the Node pin is read whole as well", async () => {
    const { checkNodeVersion } = await loadConsistency();
    const wide = {
        "package.json": JSON.stringify({
            version: "1.2.3",
            engines: { node: ">=26.11.100" }
        }),
        ".node-version": "26.11.100\n",
        "mise.toml": '[tools]\nnode = "26.11.100"\n'
    };

    assert.equal(await checkNodeVersion(fakeRepo(wide)), "26.11.100");
});

/*
 * One row per version declaration: the file, a value that disagrees with the
 * rest of the fixture, and the label the error is required to use for it.
 */
const DISAGREEMENTS = [
    [
        "INSTALL.txt",
        "IMAGE FILES TO PDF 9.9.9 - SHORTCUTS INSTALLATION",
        "INSTALL.txt: 9.9.9"
    ],
    [
        "CHANGELOG.md",
        "# Changelog\n\n## [9.9.9] - 2026-01-01\n",
        "CHANGELOG.md (newest entry): 9.9.9"
    ],
    [
        "package-lock.json",
        JSON.stringify({ version: "9.9.9", packages: { "": { version: "1.2.3" } } }),
        "package-lock.json: 9.9.9"
    ],
    [
        "package-lock.json",
        JSON.stringify({ version: "1.2.3", packages: { "": { version: "9.9.9" } } }),
        "package-lock.json (root package): 9.9.9"
    ],
    [
        "src/core/version.js",
        'const VERSION = "9.9.9";\n',
        "src/core/version.js: 9.9.9"
    ],
    [
        "package.json",
        JSON.stringify({ version: "9.9.9", engines: { node: ">=26.8.1" } }),
        "package.json: 9.9.9"
    ]
];

test("each file that states the version is compared, and named", async () => {
    const { checkVersion } = await loadConsistency();
    // The label matters as much as the detection: an error that says the
    // versions disagree without saying where sends you looking through six
    // files by hand.

    await Promise.all(DISAGREEMENTS.map(([name, content, label]) =>
        assert.rejects(
            () => checkVersion(fakeRepo({ [name]: content })),
            (error) => {
                assert.match(error.message, /versions disagree between files/u);
                assert.ok(
                    error.message.includes(label),
                    `the error must read "${label}", not: ${error.message}`
                );

                return true;
            },
            `${name} disagreeing must be caught`
        )));
});

test("only a bracketed top-level heading states the version", async () => {
    const { checkVersion } = await loadConsistency();

    // Two things must not be read as the newest release: a "### [9.9.9]"
    // subheading, which contains "## [9.9.9]" without the line-start anchor,
    // and the Unreleased section that Keep a Changelog puts above it.
    await assert.doesNotReject(() => checkVersion(fakeRepo({
        "CHANGELOG.md": "# Changelog\n\n## [Unreleased]\n\n### [9.9.9] draft\n\n"
            + "## [1.2.3] - 2026-01-01\n"
    })));
});

test("a Node pin disagreement names the file that disagrees", async () => {
    // Same reasoning as the version labels: an error that says the pins
    // disagree without saying where sends you through three files by hand.
    const { checkNodeVersion } = await loadConsistency();
    const disagreements = [
        [".node-version", "26.9.9\n", ".node-version: 26.9.9"],
        ["mise.toml", '[tools]\nnode = "26.9.9"\n', "mise.toml: 26.9.9"],
        [
            "package.json",
            JSON.stringify({ version: "1.2.3", engines: { node: ">=26.9.9" } }),
            "package.json engines: 26.9.9"
        ]
    ];

    await Promise.all(disagreements.map(([name, content, label]) =>
        assert.rejects(
            () => checkNodeVersion(fakeRepo({ [name]: content })),
            (error) => {
                assert.match(error.message, /Node versions disagree/u);
                assert.ok(
                    error.message.includes(label),
                    `the error must read "${label}", not: ${error.message}`
                );

                return true;
            }
        )));
});
