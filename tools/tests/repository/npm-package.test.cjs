"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const development = require("../../../package.json");

test("the npm package holds exactly the CLI, licence, README and derived manifest", async () => {
    const { packPackage, PACKAGE_FILES } = await import("../../../tools/npm-package.mjs");
    using destination = fs.mkdtempDisposableSync(path.join(os.tmpdir(), "iftp-npm-pack-"));
    const { report } = await packPackage(destination.path, { dryRun: true });
    assert.equal(report.name, development.name);
    assert.equal(report.version, development.version);
    assert.deepEqual(report.files.map((file) => file.path).sort(), [...PACKAGE_FILES, "package.json"].sort());
    const executable = report.files.find((file) => file.path === "Image-Files-to-PDF.cjs");
    assert.equal(executable.size, fs.statSync(path.join(__dirname, "../../../dist/Image-Files-to-PDF.cjs")).size);
    assert.deepEqual(fs.readdirSync(destination.path), [], "a dry run writes no tarball");
});
