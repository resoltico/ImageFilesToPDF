"use strict";

/*
 * Putting a finished PDF in place on the real filesystem: comparing names a
 * folder treats as the same, claiming the name, and the staging area beside
 * it. Changes happen to real files at the moment the code looks; the macOS and
 * Windows helpers are stand-ins that move real files and report as they would.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { inspectModule } = require("../../unit/ports/inspect-module.cjs");
const { destinationOperations } = require("../../../src/engine/publication.js");
const { localFilesystem, pdfFacts } = require("../../../src/engine/filesystem.js");
const { windowsClaim } = require("../../../src/engine/platform/windows-claim.js");
const { message } = require("../../../src/core/messages.js");

const PUBLICATION = require.resolve("../../../src/engine/publication.js");
const { probeGroups } = inspectModule(PUBLICATION, ["probeGroups"]);
const POSIX = process.platform !== "win32";
const isMessage = (id) => (error) => error.message === message(id);

function folder(context) {
    const made = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "iftp-publish-"))).replaceAll("\\", "/");
    context.after(() => { fs.chmodSync(made, 0o700); fs.rmSync(made, { recursive: true, force: true }); });
    return made;
}

function operations(helpers = {}) {
    const files = localFilesystem(null, null);
    return { files, ...destinationOperations(files, helpers.mac ?? null, helpers.windows ?? null) };
}

const sources = (base, names) => names.map((originalName) => ({ folder: `${base}/`, originalName }));

test("a file that cannot be looked at is a fault, and one that is not there is unknown", { skip: !POSIX || process.getuid?.() === 0 }, (context) => {
    const base = folder(context);
    const { publication } = operations();
    fs.writeFileSync(`${base}/file`, "");
    assert.deepEqual(publication.facts(`${base}/file/child`), { identity: "", size: -1 });
    assert.deepEqual(publication.facts(base), { identity: "", size: -1 }, "a folder is not a published file");
    fs.mkdirSync(`${base}/closed`);
    fs.chmodSync(`${base}/closed`, 0o000);
    try { assert.throws(() => publication.facts(`${base}/closed/a.pdf`), { code: "EACCES" }); }
    finally { fs.chmodSync(`${base}/closed`, 0o700); }
});

test("names compared in a folder are grouped, and a probe tampered with is refused and still removed", (context) => {
    const base = folder(context);
    const { files, destinationNames } = operations();
    assert.deepEqual(destinationNames.groups(sources(base, ["a.png", "b.png", "A.png"])).length, 3);
    const leftovers = () => fs.readdirSync(base).filter((name) => name.includes("ImageFilesToPDF-names"));
    assert.deepEqual(leftovers(), [], "the probe folder is removed");
    const id = files.directoryIdentity(`${base}/`);
    const scope = sources(base, ["a.png", "b.png"]).map((source, index) => ({ source, index }));
    assert.throws(() => probeGroups(files, "not-the-folder", scope, { next: 0 }), isMessage("destinationComparisonUnavailable"));
    const { readFileSync, openSync } = fs;
    context.mock.method(fs, "readFileSync", (file, ...rest) => (String(file).includes("ImageFilesToPDF-names") ? "tampered" : readFileSync(file, ...rest)));
    assert.throws(() => probeGroups(files, id, scope, { next: 0 }), isMessage("destinationComparisonTokenUnverified"));
    context.mock.method(fs, "readFileSync", readFileSync);
    context.mock.method(fs, "openSync", (file, flags, ...rest) => {
        if (String(file).includes("ImageFilesToPDF-names") && flags === "wx") { throw Object.assign(new Error("device failed"), { code: "EIO" }); }
        return openSync(file, flags, ...rest);
    });
    assert.throws(() => probeGroups(files, id, scope, { next: 0 }), { code: "EIO" });
    context.mock.method(fs, "openSync", openSync);
    // A marker replaced by another file, and the probe folder replaced by another folder.
    for (const tamper of ["marker", "folder"]) {
        context.mock.method(fs, "readFileSync", (file, ...rest) => {
            const text = readFileSync(file, ...rest);
            if (String(file).includes("ImageFilesToPDF-names")) {
                fs.mkdirSync(`${path.dirname(file)}.spare`, { recursive: true });
                // Made before the original goes, so the filesystem cannot hand back its inode.
                if (tamper === "marker") { fs.writeFileSync(`${file}.new`, text); fs.renameSync(`${file}.new`, file); }
                else { fs.renameSync(path.dirname(file), `${path.dirname(file)}.gone`); fs.mkdirSync(path.dirname(file)); }
            }
            return text;
        });
        assert.throws(() => probeGroups(files, id, scope, { next: 0 }), (error) => error.message === message("destinationComparisonDirectoryRemovalFailed") && error.issues.length >= 1, tamper);
        context.mock.method(fs, "readFileSync", readFileSync);
    }
});

test("a link claim reports what the filesystem said, and what it did not do", (context) => {
    const base = folder(context);
    fs.writeFileSync(`${base}/staged.pdf`, "pdf");
    const { publication } = operations();
    const { linkSync, lstatSync } = fs;
    context.mock.method(fs, "linkSync", () => { throw Object.assign(new Error("exists"), { code: "EEXIST" }); });
    assert.equal(publication.link(`${base}/staged.pdf`, `${base}/absent.pdf`).state, "unknown", "EEXIST with nothing there");
    context.mock.method(fs, "linkSync", linkSync);
    const windows = { move: () => Promise.resolve({ ok: true, value: true }) };
    const { publication: onWindows } = operations({ windows });
    context.mock.method(fs, "linkSync", () => { throw Object.assign(new Error("invalid function"), { code: "EISDIR" }); });
    assert.equal(onWindows.link(`${base}/staged.pdf`, `${base}/new.pdf`).state, "unsupported", "no target: the volume cannot link");
    fs.writeFileSync(`${base}/other.pdf`, "other");
    assert.equal(onWindows.link(`${base}/staged.pdf`, `${base}/other.pdf`).state, "exists");
    assert.equal(onWindows.link(`${base}/gone.pdf`, `${base}/other.pdf`).state, "unknown", "a source with no identity");
    linkSync(`${base}/staged.pdf`, `${base}/same.pdf`);
    assert.equal(onWindows.link(`${base}/staged.pdf`, `${base}/same.pdf`).state, "unknown", "the target is the source itself");
    context.mock.method(fs, "lstatSync", (file, ...rest) => {
        if (String(file).endsWith("/broken.pdf")) { throw Object.assign(new Error("unreadable"), { code: "EIO" }); }
        return lstatSync(file, ...rest);
    });
    assert.equal(onWindows.link(`${base}/staged.pdf`, `${base}/broken.pdf`).state, "unknown");
});

test("a macOS exclusive rename is judged by what happened to the files, not only by its reply", async (context) => {
    const base = folder(context);
    const helper = (act) => ({ request: ({ from, to }) => Promise.resolve(act(from, to)) });
    const claim = (act) => operations({ mac: helper(act) }).publication.rename(`${base}/staged.pdf`, `${base}/out.pdf`);
    const stage = () => { fs.rmSync(`${base}/out.pdf`, { force: true }); fs.writeFileSync(`${base}/staged.pdf`, "pdf"); };
    stage();
    assert.equal((await claim((from, to) => { fs.renameSync(from, to); return { status: 0 }; })).state, "created");
    stage();
    assert.equal((await claim(() => ({ status: -1, errno: 45 }))).state, "unsupported");
    stage();
    assert.equal((await claim(() => ({ status: -1, errno: 99 }))).state, "unknown");
    stage();
    assert.equal((await claim(() => null)).state, "unknown");
    stage();
    assert.equal((await claim((from) => { fs.appendFileSync(from, "!"); return { status: 0 }; })).state, "unknown", "the source changed");
    stage();
    assert.equal((await claim((from, to) => { fs.writeFileSync(to, "someone else"); return { status: -1, errno: 17 }; })).state, "exists");
});

test("a published PDF must be the file expected, under one name only", (context) => {
    const base = folder(context);
    const { publication } = operations();
    fs.writeFileSync(`${base}/out.pdf`, "pdf");
    const expected = publication.facts(`${base}/out.pdf`);
    assert.equal(publication.actualPath(`${base}/out.pdf`, expected), `${base}/out.pdf`);
    assert.throws(() => publication.actualPath(`${base}/out.pdf`, { ...expected, size: 99 }), isMessage("publishedPdfIdentityUnverified"));
    if (process.platform === "linux") {
        // One file under two stored spellings of the same name, asked for by a third.
        const canonical = "ệ.pdf";
        fs.writeFileSync(`${base}/${canonical}`, "pdf");
        fs.linkSync(`${base}/${canonical}`, `${base}/${canonical.normalize("NFC")}`);
        const facts = publication.facts(`${base}/${canonical}`);
        assert.throws(() => publication.actualPath(`${base}/ệ.pdf`, facts), isMessage("publishedPdfNameAmbiguous"));
    }
});

test("a staging area that cannot be identified, or is lost, is reported for cleanup", (context) => {
    const base = folder(context);
    const { operations: staging } = operations();
    const area = staging.stagingArea(`${base}/out.pdf`);
    const { lstatSync } = fs;
    context.mock.method(fs, "lstatSync", (file, options) => {
        const stats = lstatSync(file, options);
        return String(file) === area.directory ? Object.assign(Object.create(Object.getPrototypeOf(stats)), stats, { ino: 0n }) : stats;
    });
    assert.throws(() => staging.openStaging(area), isMessage("stagingDirectoryUnverified"));
    context.mock.method(fs, "lstatSync", lstatSync);
    fs.rmdirSync(area.directory);
    const lost = staging.stagingArea(`${base}/out.pdf`);
    staging.openStaging(lost);
    // Moved aside, not removed, so the new folder cannot be given the old one's inode.
    fs.renameSync(lost.directory, `${lost.directory}.old`);
    fs.mkdirSync(lost.directory);
    assert.equal(staging.closeStaging(lost)[0].diagnostic.message, message("stagingDirectoryOwnershipLost"));
    fs.rmdirSync(lost.directory);
    assert.equal(staging.closeStaging(lost)[0].diagnostic.path, lost.directory, "a staging area that is gone");
});

function windowsBench(context) {
    const base = folder(context);
    const files = localFilesystem(null, null);
    const claim = (move, directoryIdentity = files.directoryIdentity, facts = pdfFacts) =>
        windowsClaim({ move }, directoryIdentity, facts, () => undefined)(`${base}/staged.pdf`, `${base}/out.pdf`);
    const stage = () => { fs.rmSync(`${base}/out.pdf`, { force: true }); fs.writeFileSync(`${base}/staged.pdf`, "pdf"); };
    return { base, files, claim, stage };
}

test("a Windows move is judged by its reply and by the files", async (context) => {
    const { base, claim, stage } = windowsBench(context);
    const moving = (reply) => (from, to) => { fs.renameSync(from, to); return Promise.resolve(reply); };
    stage();
    const created = await claim(moving({ ok: true, value: true }));
    assert.equal(created.state, "created");
    created.close();
    stage();
    assert.equal((await claim(() => Promise.resolve({ ok: false, code: 5 }))).state, "denied");
    stage();
    fs.writeFileSync(`${base}/out.pdf`, "taken");
    assert.equal((await claim(() => Promise.resolve({ ok: false, code: 183 }))).state, "exists");
    stage();
    assert.equal((await claim(() => Promise.resolve({ ok: false, code: 183 }))).state, "unknown", "exists, with nothing there");
    stage();
    assert.equal((await claim(() => Promise.resolve({ ok: false, code: 999 }))).state, "unknown");
    stage();
    assert.equal((await claim(() => Promise.resolve({ ok: true, value: true }))).state, "unknown", "a success that left the source in place");
    stage();
    assert.equal((await claim((from, to) => { fs.renameSync(from, to); fs.appendFileSync(to, "!"); return Promise.resolve({ ok: true, value: true }); })).state, "unknown");
    stage();
    assert.equal((await claim(() => Promise.reject(new Error("helper failed")))).diagnostic.message, "helper failed");
});

test("a Windows move is not trusted when a folder or the source changes around it", async (context) => {
    const { base, files, claim, stage } = windowsBench(context);
    stage();
    let calls = 0;
    const shifting = (directory) => { calls += 1; return calls > 2 ? "changed" : files.directoryIdentity(directory); };
    assert.equal((await claim(() => Promise.resolve({ ok: false, code: 5 }), shifting)).state, "unknown", "a folder replaced during the move");
    stage();
    let seen = 0;
    const changing = (file) => { seen += 1; return seen > 1 ? { identity: "other", size: 3 } : pdfFacts(file); };
    assert.equal((await claim(() => Promise.resolve({ ok: true, value: true }), files.directoryIdentity, changing)).state, "unknown", "the source changed first");
    fs.mkdirSync(`${base}/directory.pdf`);
    const directoryClaim = await windowsClaim({ move: () => Promise.resolve({ ok: true }) }, files.directoryIdentity, () => ({ identity: "x", size: 0 }), () => undefined)(`${base}/directory.pdf`, `${base}/out.pdf`).catch((error) => ({ state: error.code }));
    assert.ok(["unknown", "EISDIR"].includes(directoryClaim.state));
});
