"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { readFile } = require("node:fs/promises");

// The banner names the version package.json declares; the consistency gate keeps the other declarations in agreement.
const { version } = require("../../package.json");

function checkBanner(release) {
    assert.ok(release.startsWith(`/*\n * Image Files to PDF ${version}\n`), "the banner names the declared version");
    assert.match(release, /SPDX-License-Identifier: AGPL-3\.0-only/u);
    assert.match(release, /Corresponding Source: https:\/\/github\.com\/resoltico\/ImageFilesToPDF/u);
    assert.match(release, /Requires macOS 13\.5 or later, Node\.js 26 or later/u);
}

test("artifact is standalone, scoped, licensed, deterministic, and current", async () => {
    const { renderArtifacts, artifactName, nodeArtifactName, nodeArtifactPath, artifactPath, manifestPath, renderManifest } = await import("../../tools/release.mjs");
    const { parseScript, commentsIn } = await import("../../tools/javascript.mjs");
    const artifacts = await renderArtifacts();
    const release = artifacts[artifactName];
    checkBanner(release);
    const tree = parseScript(release, 2022);
    assert.ok(tree.body.some((node) => node.type === "FunctionDeclaration" && node.id.name === "run"));
    assert.equal(commentsIn(release, 2022).length, 1);
    assert.deepEqual(await renderArtifacts(), artifacts);
    assert.equal(await readFile(nodeArtifactPath, "utf8"), artifacts[nodeArtifactName]);
    const { MINIMUM_NODE_VERSION } = require("../../src/node/runtime.js");
    assert.equal((await readFile(require("node:path").resolve(__dirname, "../../.node-version"), "utf8")).trim(), MINIMUM_NODE_VERSION);
    assert.match(artifacts[nodeArtifactName], /Requires Node\.js 26\.13\.1 or later/u);
    assert.equal(await readFile(artifactPath, "utf8"), release);
    assert.equal(await readFile(manifestPath, "utf8"), renderManifest(artifacts));
});
