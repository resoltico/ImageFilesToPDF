"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const process = require("node:process");
const { spawnSync } = require("node:child_process");

function rename(probe, from, to) {
    const result = spawnSync("/usr/bin/osascript", ["-l", "JavaScript", probe, from, to], { encoding: "utf8", timeout: 10000 });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
}

function freeDestination(probe, folder) {
    const from = path.join(folder, "source"), to = path.join(folder, "destination");
    fs.writeFileSync(from, "probe source", { flag: "wx" });
    const result = rename(probe, from, to);
    if (result.status === 0) {
        assert.equal(result.code, 0);
        assert.equal(fs.existsSync(from), false);
        assert.equal(fs.readFileSync(to, "utf8"), "probe source");
    } else {
        assert.equal(result.status, -1);
        assert.ok([45, 78].includes(result.code), `unexpected exclusive-rename error: ${JSON.stringify(result)}`);
        assert.equal(fs.readFileSync(from, "utf8"), "probe source");
        assert.equal(fs.existsSync(to), false);
    }
    return { supported: result.status === 0, code: result.code };
}

function occupiedDestination(probe, folder, capability) {
    const from = path.join(folder, "occupied-source"), to = path.join(folder, "occupied-destination");
    fs.writeFileSync(from, "second source", { flag: "wx" });
    fs.writeFileSync(to, "keep this entry", { flag: "wx" });
    const result = rename(probe, from, to);
    assert.equal(result.status, -1, "the primitive must never replace an occupied name");
    assert.ok((capability.supported ? [17] : [17, capability.code]).includes(result.code), JSON.stringify(result));
    assert.equal(fs.readFileSync(from, "utf8"), "second source");
    assert.equal(fs.readFileSync(to, "utf8"), "keep this entry");
}

function probeExclusiveRename(probe, volume) {
    const folder = fs.mkdtempSync(path.join(volume, "rename-control-"));
    try {
        const capability = freeDestination(probe, folder);
        occupiedDestination(probe, folder, capability);
        return capability;
    } finally { fs.rmSync(folder, { recursive: true }); }
}

if (require.main === module) { process.stdout.write(`${JSON.stringify(probeExclusiveRename(process.argv[2], process.argv[3]))}\n`); }
module.exports = { probeExclusiveRename };
