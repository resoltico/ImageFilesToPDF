"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { readFile } = require("node:fs/promises");

function checkBanner(release) {
    assert.match(release, /^\/\*\n \* Image Files to PDF 2\.0\.0\n/u);
    assert.match(release, /SPDX-License-Identifier: MPL-2\.0/u);
    assert.match(release, /Source Code Form: https:\/\/github\.com\/resoltico\/ImageFilesToPDF/u);
    assert.match(release, /Requires macOS 12\.3 or later/u);
}

test("artifact is standalone, scoped, licensed, deterministic, and current", async () => {
    const { renderRelease, artifactPath, manifestPath, digestOf, renderManifest } = await import("../../tools/release.mjs");
    const { parseScript, commentsIn } = await import("../../tools/javascript.mjs");
    const release = await renderRelease();
    checkBanner(release);
    const tree = parseScript(release, 2022);
    assert.ok(tree.body.some((node) => node.type === "FunctionDeclaration" && node.id.name === "run"));
    assert.equal(commentsIn(release, 2022).length, 1);
    assert.equal(await renderRelease(), release);
    assert.equal(await readFile(artifactPath, "utf8"), release);
    assert.equal(await readFile(manifestPath, "utf8"), renderManifest(digestOf(release)));
});
