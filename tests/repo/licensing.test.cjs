"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const packageJson = require("../../package.json");
const lock = require("../../package-lock.json");

const root = path.resolve(__dirname, "../..");
const read = (file) => readFile(path.join(root, file), "utf8");

test("first-party licensing is MPL 2.0 in metadata and the license file", async () => {
    assert.equal(packageJson.license, "MPL-2.0");
    assert.equal(lock.packages[""].license, "MPL-2.0");
    const license = await read("LICENSE");

    assert.match(license, /Mozilla Public License Version 2\.0/u);
    assert.match(license, /SPDX-License-Identifier: MPL-2\.0/u);
    assert.match(license, /first-party source, tests, build/u);
    assert.match(license, /3\. Responsibilities/u);
    assert.match(license, /This Source Code Form is subject to the terms/u);
});

test("the standalone artifact preserves licensing and its matching source location", async () => {
    const { renderRelease } = await import("../../tools/release.mjs");
    const rendered = await renderRelease();
    const artifact = await read("dist/Image-Files-to-PDF.jxa");

    for (const text of [rendered, artifact]) {
        assert.match(text, /SPDX-License-Identifier: MPL-2\.0/u);
        assert.match(text, /This Source Code Form is subject to the terms/u);
        assert.match(text, /https:\/\/mozilla\.org\/MPL\/2\.0\//u);
        assert.ok(text.includes(`Source Code Form: ${packageJson.homepage}/tree/v${packageJson.version}`));
    }
});

test("the full license is uploaded, attested and verified as a release asset", async () => {
    const workflow = await read(".github/workflows/release.yml");

    assert.match(workflow, /subject-path: \|\n(?: {12}[^\n]+\n)* {12}LICENSE\n/u);
    assert.match(workflow, /for subject in [^\n]* INSTALL\.txt LICENSE; do/u);
    assert.match(workflow, /gh release create [\s\S]*?\n {12}LICENSE \\\n/u);
});
