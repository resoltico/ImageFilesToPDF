"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const packageJson = require("../../package.json");
const lock = require("../../package-lock.json");

const root = path.resolve(__dirname, "../..");
const read = (file) => readFile(path.join(root, file), "utf8");

test("first-party licensing is AGPL-3.0-only in metadata and the license file", async () => {
    assert.equal(packageJson.license, "AGPL-3.0-only");
    assert.equal(lock.packages[""].license, "AGPL-3.0-only");
    const license = await read("LICENSE");

    assert.match(license, /^ {20}GNU AFFERO GENERAL PUBLIC LICENSE\n {23}Version 3, 19 November 2007\n/u);
    assert.match(license, /13\. Remote Network Interaction; Use with the GNU General Public License\./u);
    assert.match(license, /END OF TERMS AND CONDITIONS/u);
});

test("the standalone artifact preserves licensing and its matching source location", async () => {
    const { renderRelease } = await import("../../tools/release.mjs");
    const rendered = await renderRelease();
    const artifact = await read("dist/Image-Files-to-PDF.jxa");

    for (const text of [rendered, artifact]) {
        assert.match(text, /SPDX-License-Identifier: AGPL-3\.0-only/u);
        assert.match(text, /GNU Affero General Public License, version 3 only/u);
        assert.match(text, /https:\/\/www\.gnu\.org\/licenses\/agpl-3\.0\.html/u);
        assert.ok(text.includes(`Corresponding Source: ${packageJson.homepage}/tree/v${packageJson.version}`));
    }
});

test("the full license is uploaded, attested and verified as a release asset", async () => {
    const workflow = await read(".github/workflows/release.yml");

    assert.match(workflow, /subject-path: \|\n(?: {12}[^\n]+\n)* {12}LICENSE\n/u);
    assert.match(workflow, /for subject in [^\n]* INSTALL\.txt LICENSE; do/u);
    assert.match(workflow, /gh release create [\s\S]*?\n {12}LICENSE \\\n/u);
});

test("the pending commercial route grants nothing and points to the public license", async () => {
    const commercial = await read("LICENSE-COMMERCIAL.md");

    assert.match(commercial, /public license is AGPL-3\.0-only; see \[LICENSE\]\(LICENSE\)/u);
    assert.match(commercial, /grants no commercial exception/u);
    const linking = await Promise.all(["README.md", "CONTRIBUTING.md"].map(read));
    for (const text of linking) {
        assert.match(text, /\[LICENSE-COMMERCIAL\.md\]\(LICENSE-COMMERCIAL\.md\)/u);
    }
});

test("contributions are accepted under stated terms that permit commercial licensing", async () => {
    const [contributing, template] = await Promise.all([read("CONTRIBUTING.md"), read(".github/PULL_REQUEST_TEMPLATE.md")]);
    const terms = contributing.split("\n## Contribution terms\n")[1]?.split("\n## ")[0] ?? "";

    assert.match(terms, /license it to everyone under this repository's public license,\n {2}`AGPL-3\.0-only`/u);
    assert.match(terms, /grant Ervins Strauhmanis a perpetual, worldwide, non-exclusive,\n {2}royalty-free, irrevocable license/u);
    assert.match(terms, /including the commercial\n {2}terms described in \[LICENSE-COMMERCIAL\.md\]\(LICENSE-COMMERCIAL\.md\)/u);
    assert.match(template, /^- \[ \] I agree to the \[contribution terms\]\([^)]*CONTRIBUTING\.md#contribution-terms\)/mu);
});
