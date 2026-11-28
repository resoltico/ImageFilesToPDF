"use strict";

/*
 * Reading sources safely on a real filesystem: what a path is, whether a file
 * stayed the same while it was read, and what a folder lists. A file that
 * changes is changed for real, at the moment the code reads it; only failures
 * a filesystem cannot be made to produce on cue are injected.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { Buffer } = require("node:buffer");
const { inspectModule } = require("../../unit/ports/inspect-module.cjs");
const { localFilesystem } = require("../../../src/engine/filesystem.js");
const { UserCanceled } = require("../../../src/core/errors.js");
const { message } = require("../../../src/core/messages.js");

const FILESYSTEM = require.resolve("../../../src/engine/filesystem.js");
const { copyHandle, identity } = inspectModule(FILESYSTEM, ["copyHandle", "identity"]);
const POSIX = process.platform !== "win32";
const UNPRIVILEGED = POSIX && process.getuid?.() !== 0;

function folder(context) {
    const made = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "iftp-files-")));
    context.after(() => { fs.chmodSync(made, 0o700); fs.rmSync(made, { recursive: true, force: true }); });
    return made.replaceAll("\\", "/");
}

function source(context, content = "0123456789") {
    const file = `${folder(context)}/source.bin`;
    fs.writeFileSync(file, content);
    return file;
}

// A macOS helper's answers, for the cases about what it answers.
const answering = (reply) => ({ request: ({ paths }) => Promise.resolve(reply(paths)) });
const plain = answering((paths) => paths.map(() => ({ package: false, alias: false })));

const isMessage = (id, params = {}) => (error) => error.message === message(id, params);

test("a path through a link, or through a file, is not followed", { skip: !POSIX }, async (context) => {
    const base = folder(context);
    fs.mkdirSync(`${base}/real`);
    fs.writeFileSync(`${base}/real/a.png`, "x");
    fs.symlinkSync(`${base}/real`, `${base}/linked`);
    const files = localFilesystem(null, null);
    assert.equal((await files.tree.inspect(`${base}/linked/a.png`)).kind, "link");
    assert.equal((await files.tree.inspect(`${base}/real/a.png/child`)).kind, "unexaminable");
});

test("what cannot be looked at is told apart from what is missing", { skip: !UNPRIVILEGED }, async (context) => {
    const base = folder(context);
    fs.mkdirSync(`${base}/closed`);
    fs.chmodSync(`${base}/closed`, 0o000);
    const files = localFilesystem(null, null);
    try { assert.equal((await files.tree.inspect(`${base}/closed/a.png`)).kind, "unreadable"); }
    finally { fs.chmodSync(`${base}/closed`, 0o700); }
    assert.equal((await files.tree.inspect(`${base}/${"n".repeat(300)}`)).kind, "unexaminable", "a name too long for the filesystem");
});

test("a folder is not a source, and a folder that is not one has no identity", async (context) => {
    const base = folder(context);
    const files = localFilesystem(null, null);
    await assert.rejects(files.sources.facts(base), isMessage("sourceIdentityUnverified"));
    await assert.rejects(files.sources.facts(`${base}/missing`), isMessage("sourceAttributesUnavailable"));
    assert.throws(() => files.directoryIdentity(source(context)), (error) => error.message.startsWith(message("destinationDirectoryUnverified", { directory: "" }).slice(0, 20)));
    assert.equal(identity({ ino: 0n, dev: 1n }), "", "a filesystem without inode numbers gives no identity");
    assert.equal(await files.tree.entries(source(context)), null, "a file lists nothing");
});

test("a source that grows, shrinks or is replaced while it is read is refused as changed", async (context) => {
    const files = localFilesystem(null, null);
    const out = folder(context);
    const { readSync } = fs;
    let change = null;
    context.mock.method(fs, "readSync", (...args) => {
        if (change) { const pending = change; change = null; pending(); }
        return readSync(...args);
    });
    const file = source(context);
    change = () => fs.appendFileSync(file, "more");
    await assert.rejects(files.sources.capture(file, `${out}/grown`), (error) => error.issues?.[0]?.message === message("sourceChanged"));
    const shrinking = source(context);
    change = () => fs.truncateSync(shrinking, 0);
    await assert.rejects(files.sources.capture(shrinking, `${out}/shrunk`), (error) => error.issues?.length === 1);
    const prefixed = source(context);
    const facts = await files.sources.facts(prefixed);
    change = () => fs.truncateSync(prefixed, 0);
    await assert.rejects(files.sources.prefix(prefixed, facts), isMessage("sourceAttributesUnavailable"));
});

test("a source replaced between its facts and its opening, or not the one expected, is refused", async (context) => {
    const files = localFilesystem(null, null);
    const file = source(context);
    const before = await files.sources.facts(file);
    fs.writeFileSync(file, "different content");
    await assert.rejects(files.sources.prefix(file, before), (error) => error.issues?.[0]?.message === message("sourceChanged"));
    const { openSync } = fs;
    const replaced = source(context);
    context.mock.method(fs, "openSync", (target, ...rest) => {
        if (target === replaced) { fs.writeFileSync(replaced, "replaced before opening"); }
        return openSync(target, ...rest);
    });
    await assert.rejects(files.sources.pngCount(replaced), (error) => error.issues?.[0]?.message === message("sourceChanged"));
});

test("a copy that cannot be written, or comes out short, is refused", (context) => {
    const base = folder(context);
    const file = source(context);
    const fd = fs.openSync(file, "r");
    context.after(() => fs.closeSync(fd));
    const target = (name) => fs.openSync(`${base}/${name}`, "wx");
    assert.throws(() => copyHandle(fd, target("huge"), 2 ** 53 + 2), isMessage("sourceSizeUnrepresentable"));
    const { writeSync } = fs;
    context.mock.method(fs, "writeSync", () => 0);
    assert.throws(() => copyHandle(fd, target("unwritable"), 10), isMessage("privateCopyUnwritable"));
    context.mock.method(fs, "writeSync", (out, data, offset, length) => length);
    assert.throws(() => copyHandle(fd, target("short"), 10), isMessage("privateCopySizeUnverified"));
    context.mock.method(fs, "writeSync", writeSync);
});

test("a capture onto a name already taken fails as a capture, and a stop is not turned into a fault", async (context) => {
    const file = source(context);
    const taken = `${folder(context)}/taken`;
    fs.writeFileSync(taken, "");
    const files = localFilesystem(null, null);
    await assert.rejects(files.sources.capture(file, taken), (error) => error.issues?.[0]?.message === message("sourceCaptureFailed"));
    const stopping = localFilesystem({ local: () => Promise.reject(new UserCanceled()) }, null);
    await assert.rejects(stopping.sources.capture(file, `${folder(context)}/out`), { name: "UserCanceled" });
    await assert.rejects(stopping.tree.inspect(file), { name: "UserCanceled" });
    await assert.rejects(stopping.tree.entries(path.dirname(file)), { name: "UserCanceled" });
    const { readSync } = fs;
    context.mock.method(fs, "readSync", () => { throw Object.assign(new Error("device failed"), { code: "EIO" }); });
    const facts = await files.sources.facts(file);
    await assert.rejects(files.sources.prefix(file, facts), isMessage("sourceAttributesUnavailable"));
    context.mock.method(fs, "readSync", readSync);
});

test("a file a cloud provider changes while bringing it down is refused", async (context) => {
    const file = source(context);
    const hydrating = localFilesystem({ local: () => Promise.resolve(true), hydrateCloudFile: (target) => { fs.appendFileSync(target, "downloaded"); return Promise.resolve(true); } }, null);
    await assert.rejects(hydrating.sources.facts(file), (error) => error.issues?.[0]?.message === message("sourceChanged"));
    const remote = localFilesystem({ local: () => Promise.resolve(false) }, null);
    assert.equal((await remote.tree.inspect(file)).kind, "unexaminable", "a file on a drive that is not local");
});

test("the macOS helper's word on packages and aliases is taken, and a muddled answer is not", async (context) => {
    const base = folder(context);
    fs.writeFileSync(`${base}/a.png`, "x");
    const kind = async (helper) => (await localFilesystem(null, helper).tree.inspect(`${base}/a.png`)).kind;
    assert.equal(await kind(answering((paths) => paths.map((entry, index) => ({ package: false, alias: index === paths.length - 1 })))), "link");
    assert.equal(await kind(answering(() => [])), "unexaminable");
    assert.equal(await kind(answering((paths) => paths.map(() => ({ package: "no", alias: false })))), "unexaminable");
    assert.equal(await kind(plain), "file");
    const listing = (reply) => localFilesystem(null, answering(reply));
    const remembered = listing((paths) => paths.map((entry) => ({ package: entry.endsWith(".app"), alias: entry.endsWith("alias") })));
    fs.mkdirSync(`${base}/Thing.app`);
    fs.writeFileSync(`${base}/alias`, "");
    assert.deepEqual((await remembered.tree.entries(base)).sort(), ["Thing.app", "a.png", "alias"]);
    assert.equal((await remembered.tree.inspect(`${base}/Thing.app`)).kind, "package");
    assert.equal((await remembered.tree.inspect(`${base}/alias`)).kind, "link");
    const odd = listing((paths) => paths.map(() => ({ package: 1, alias: 0 })));
    await odd.tree.entries(base);
    assert.equal((await odd.tree.inspect(`${base}/a.png`)).kind, "unexaminable");
    assert.equal(await listing(() => []).tree.entries(base), null, "an incomplete answer lists nothing");
    fs.mkdirSync(`${base}/empty`);
    assert.deepEqual(await localFilesystem(null, plain).tree.entries(`${base}/empty`), [], "an empty folder asks nothing more");
});

test("a child that disappears while its folder is listed is left out", async (context) => {
    const base = folder(context);
    fs.writeFileSync(`${base}/stays.png`, "x");
    fs.writeFileSync(`${base}/goes.png`, "x");
    const { lstatSync } = fs;
    context.mock.method(fs, "lstatSync", (file, ...rest) => {
        if (String(file).endsWith("goes.png")) { throw Object.assign(new Error("gone"), { code: "ENOENT" }); }
        return lstatSync(file, ...rest);
    });
    const listed = await localFilesystem(null, plain).tree.entries(base);
    assert.deepEqual(listed.sort(), ["goes.png", "stays.png"], "the listing names it; its facts are not remembered");
});

test("names that are not text, or not ordinary, are not listed", { skip: process.platform !== "linux" }, async (context) => {
    const base = folder(context);
    fs.writeFileSync(Buffer.concat([Buffer.from(`${base}/`), Buffer.from([0xff, 0x2e, 0x70])]), "");
    fs.writeFileSync(`${base}/�.png`, "");
    fs.writeFileSync(`${base}/plain.png`, "");
    assert.deepEqual(await localFilesystem(null, null).tree.entries(base), ["plain.png"]);
});

test("on Windows, names Windows cannot reach in the ordinary way are not listed", { skip: POSIX }, async (context) => {
    const base = folder(context);
    fs.writeFileSync(path.toNamespacedPath(`${base}/trailing.`), "");
    fs.writeFileSync(`${base}/plain.png`, "");
    const names = await localFilesystem(null, null).tree.entries(base);
    assert.deepEqual(names, ["plain.png"]);
});
