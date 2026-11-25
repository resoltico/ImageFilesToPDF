"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");

const load = () => import("../../../tools/npm-package.mjs");

const development = {
    name: "project-cli",
    version: "1.2.3",
    private: true,
    description: "Does a thing",
    license: "AGPL-3.0-only",
    author: "Someone",
    homepage: "https://github.com/someone/Project",
    repository: { type: "git", url: "git+https://github.com/someone/Project.git" },
    engines: { node: ">=26.8.1", npm: ">=12.2.2" },
    scripts: { test: "node --test" },
    devDependencies: { eslint: "1.0.0" },
    overrides: { glob: "1.0.0" },
    packageManager: "npm@12.2.2"
};

test("the publish manifest is derived, public and carries only the command", async () => {
    const { renderPackageManifest } = await load();
    assert.deepEqual(renderPackageManifest(development), {
        name: "project-cli",
        version: "1.2.3",
        description: "Does a thing",
        license: "AGPL-3.0-only",
        author: "Someone",
        homepage: "https://github.com/someone/Project",
        repository: { type: "git", url: "git+https://github.com/someone/Project.git" },
        bugs: { url: "https://github.com/someone/Project/issues" },
        bin: { "project-cli": "Image-Files-to-PDF.cjs" },
        files: ["Image-Files-to-PDF.cjs"],
        engines: { node: ">=26.8.1" }
    });
});
