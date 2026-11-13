"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const process = require("node:process");
const { execFileSync } = require("node:child_process");

function entries(folder) {
    try { return fs.readdirSync(folder); }
    catch (error) { if (error.code === "ENOENT") { return []; } throw error; }
}

function identity(facts) { return `${facts.dev}:${facts.ino}`; }

function identities(folder) {
    return new Set(entries(folder).flatMap((name) => {
        try { return [identity(fs.lstatSync(path.join(folder, name), { bigint: true }))]; }
        catch (error) { if (error.code === "ENOENT") { return []; } throw error; }
    }));
}

function recoveryInventory() {
    const downloads = path.join(fs.realpathSync(os.homedir()), "Downloads");
    return { downloads: fs.existsSync(downloads) ? fs.realpathSync(downloads) : downloads,
        downloadIdentities: identities(downloads), temporary: fs.realpathSync(os.tmpdir()), temporaryIdentities: identities(os.tmpdir()) };
}

function newRecovery(file, inventory) {
    const parent = fs.realpathSync(path.dirname(file));
    const facts = fs.lstatSync(file, { bigint: true });
    if (parent === inventory.downloads) {
        assert.equal(inventory.downloadIdentities.has(identity(facts)), false, "recovery must not reuse a preexisting entry");
    } else {
        assert.equal(fs.realpathSync(path.dirname(parent)), inventory.temporary);
        assert.match(path.basename(parent), /^ImageFilesToPDF-recovered\./u);
        assert.equal(inventory.temporaryIdentities.has(identity(fs.lstatSync(parent, { bigint: true }))), false, "temporary recovery must belong to this run");
    }
    assert.equal(facts.isFile(), true);
    return { file, device: facts.dev, inode: facts.ino };
}

function assertRecoveredPdf(document, source, capability, inventory) {
    assert.equal(capability.supported, false);
    assert.equal(document.state, "recovered");
    assert.deepEqual(document.sources, [source]);
    assert.equal(document.pages, 1);
    assert.equal(document.output, undefined);
    assert.equal(document.issues.length, 1);
    const [issue] = document.issues;
    assert.equal(issue.code, "publication");
    assert.equal(issue.stage, "publication");
    assert.equal(issue.diagnostic.state, "unsupported");
    assert.equal(issue.diagnostic.code, capability.code);
    const owned = newRecovery(document.recovery, inventory);
    execFileSync("pdfcpu", ["validate", "--conf", "disable", "--mode=strict", owned.file], { stdio: "pipe" });
    execFileSync("qpdf", ["--check", owned.file], { stdio: "pipe" });
    assert.match(execFileSync("pdfinfo", [owned.file], { encoding: "utf8" }), /^Pages:\s+1\s*$/mu);
    return owned;
}

function removeRecovery(owned) {
    const facts = fs.lstatSync(owned.file, { bigint: true });
    assert.equal(facts.dev, owned.device);
    assert.equal(facts.ino, owned.inode);
    assert.equal(facts.isFile(), true);
    fs.unlinkSync(owned.file);
    const parent = path.dirname(owned.file);
    if (/^ImageFilesToPDF-recovered\./u.test(path.basename(parent))) { fs.rmdirSync(parent); }
}

if (require.main === module) {
    const [receipt, source, capability, inventoryFile] = process.argv.slice(2);
    const saved = JSON.parse(fs.readFileSync(inventoryFile, "utf8"));
    const inventory = { ...saved, downloadIdentities: new Set(saved.downloadIdentities), temporaryIdentities: new Set(saved.temporaryIdentities) };
    const result = JSON.parse(fs.readFileSync(receipt, "utf8"));
    assert.equal(result.state, "incomplete");
    assert.deepEqual(result.rejected, []);
    assert.deepEqual(result.issues, []);
    assert.equal(result.documents.length, 1);
    removeRecovery(assertRecoveredPdf(result.documents[0], source, JSON.parse(capability), inventory));
}
module.exports = { recoveryInventory, assertRecoveredPdf, removeRecovery };
