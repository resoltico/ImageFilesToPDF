"use strict";

/*
 * A fake repository, so the consistency checks are exercised against
 * controlled contents rather than only against the real tree.
 *
 * Every default here uses single-digit version components, which is what most
 * cases want; the width cases in consistency-versions.test.cjs override them.
 */
function fakeRepo(overrides = {}) {
    const files = {
        "package.json": JSON.stringify({
            version: "1.2.3",
            engines: { node: ">=26.8.1" },
            homepage: "https://github.com/someone/Project",
            repository: { type: "git", url: "git+https://github.com/someone/Project.git" }
        }),
        "package-lock.json": JSON.stringify({
            version: "1.2.3",
            packages: { "": { version: "1.2.3" } }
        }),
        "INSTALL.txt":
            "IMAGE FILES TO PDF 1.2.3 - SHORTCUTS INSTALLATION\nhttps://github.com/someone/Project\n",
        "CHANGELOG.md": "# Changelog\n\n## [1.2.3] - 2026-01-01\n",
        "src/core/version.js": 'const VERSION = "1.2.3";\n',
        ".node-version": "26.8.1\n",
        "mise.toml": '[tools]\nnode = "26.8.1"\n',
        "README.md": "Source: https://github.com/someone/Project\n",
        ...overrides
    };

    return (relative) => Promise.resolve(files[relative]);
}

const loadConsistency = () => import("../../../tools/lint/consistency.mjs");

module.exports = { fakeRepo, loadConsistency };
