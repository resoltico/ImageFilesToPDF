"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

async function checkPrerequisite(version, pixels) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ImageFilesToPDF-prerequisite-"));
    const source = `#!${process.execPath}
const assert = require("node:assert/strict");
if (process.argv[2] === "version") {
    console.log(${JSON.stringify(`version: v${version}`)});
} else {
    assert.deepEqual(process.argv.slice(2), ["--conf", "disable", "config", "inspect", "--json"]);
    console.log(JSON.stringify({limits: {maxImagePixels: ${pixels}}}));
}
`;

    try {
        await fs.writeFile(path.join(directory, "pdfcpu"), source, { mode: 0o700 });

        return spawnSync(process.execPath, [path.resolve(__dirname, "../../tools/check-pdfcpu.mjs")], {
            env: { ...process.env, PATH: `${directory}:${process.env.PATH}` },
            encoding: "utf8"
        });
    } finally {
        await fs.rm(directory, { recursive: true, force: true });
    }
}

test("the CI prerequisite accepts the supported release and stateless image limit", async () => {
    const result = await checkPrerequisite("0.16.1", 100000000);

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Stateless image pixel limit: 100000000/u);
});

test("the CI prerequisite rejects an older installed release", async () => {
    const result = await checkPrerequisite("0.15.0", 100000000);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Version 0\.16\.1 or later is required/u);
});

test("the CI prerequisite rejects backend pixel limits that no longer match the DPI calculation", async () => {
    const result = await checkPrerequisite("0.16.1", 99999999);

    assert.equal(result.status, 1);
    assert.match(result.stderr, /stateless image pixel limit differs/u);
});
