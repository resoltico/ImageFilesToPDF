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
            name: "project-cli",
            version: "1.2.3",
            engines: { node: ">=26.8.1", npm: ">=12.2.2" },
            packageManager: "npm@12.2.2",
            homepage: "https://github.com/someone/Project",
            repository: { type: "git", url: "git+https://github.com/someone/Project.git" }
        }),
        "package-lock.json": JSON.stringify({
            version: "1.2.3",
            packages: { "": { version: "1.2.3" } }
        }),
        "INSTALL.txt":
            "IMAGE FILES TO PDF 1.2.3 - SHORTCUTS INSTALLATION\nhttps://github.com/someone/Project\n    defaults delete com.someone.Project\n",
        "CHANGELOG.md": "# Changelog\n\n## [1.2.3] - 2026-01-01\n",
        ".node-version": "26.8.1\n",
        "mise.toml": '[tools]\nnode = "26.8.1"\n',
        "tests/integration/linux-native.Dockerfile": "FROM node:26.8.1-trixie-slim AS base\n" +
            "ADD https://github.com/pdfcpu/pdfcpu/releases/download/v0.16.4/pdfcpu_0.16.4_Linux_arm64.tar.xz /tmp/p\n",
        "tests/integration/windows-tools.ps1": "Add-Tool 'https://github.com/pdfcpu/pdfcpu/releases/download/v0.16.4/pdfcpu_0.16.4_Windows_x86_64.zip'\n",
        "src/core/setup.js": 'const MINIMUM_PDFCPU_VERSION = "0.16.4";\n',
        "src/core/data-locations.js": 'const DATA_FOLDER = "Project";\nconst STATE_FOLDER = "project";\nconst PREFERENCES_DOMAIN = "com.someone.Project";\n',
        "tools/finder-floor.mjs": 'export const MINIMUM_MACOS = "13.5";\nexport const FINDER_JAVASCRIPTCORE = "safari16.6";\n',
        // One document stating every kind of floor claim the check knows.
        "README.md": "Source: https://github.com/someone/Project\n" +
            "macOS 13.5 or later, Safari 16.6, Node.js 26.8.1 or later, below the 26.8.1 minimum, pdfcpu 0.16.4 or later.\n" +
            "https://github.com/nodejs/node/blob/v26.8.1/BUILDING.md and https://nodejs.org/en/blog/release/v26.8.1\n" +
            "the preferences domain `com.someone.Project`\n",
        "HEADLESS.md": "", "QA.md": "On macOS 27.2.1 with Node.js 24.0.0, measured.\n`~/Library/Application Support/Project/Workspaces`, " +
            // eslint-disable-next-line no-template-curly-in-string -- The document quotes a shell variable, not a template.
            "`${XDG_STATE_HOME:-$HOME/.local/state}/project/workspaces`, `%LOCALAPPDATA%\\Project\\Workspaces`\n", "CONTRIBUTING.md": "",
        ...overrides
    };

    return (relative) => Promise.resolve(files[relative]);
}

const loadConsistency = () => import("../../../tools/lint/consistency.mjs");

module.exports = { fakeRepo, loadConsistency };
