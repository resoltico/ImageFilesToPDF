"use strict";

/*
 * The private workspace store on the real filesystem: its root, the workspaces
 * of this and other processes, and what is left alone. HOME and the state
 * directory point into a temporary folder for each test.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { spawnSync } = require("node:child_process");
const { inspectModule } = require("../../unit/ports/inspect-module.cjs");
const { workspaceStore } = require("../../../src/engine/workspaces.js");
const { localFilesystem } = require("../../../src/engine/filesystem.js");
const { commandSession } = require("../../../src/engine/processes.js");
const { UserCanceled } = require("../../../src/core/errors.js");
const { message } = require("../../../src/core/messages.js");

const WORKSPACES = require.resolve("../../../src/engine/workspaces.js");
const { processStart, createParent } = inspectModule(WORKSPACES, ["processStart", "createParent"]);
const POSIX = process.platform !== "win32";
const UNPRIVILEGED = POSIX && process.getuid?.() !== 0;
const isMessage = (id) => (error) => error.message === message(id);

function home(context) {
    const made = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "iftp-home-")));
    const saved = { HOME: process.env.HOME, XDG_STATE_HOME: process.env.XDG_STATE_HOME, LOCALAPPDATA: process.env.LOCALAPPDATA };
    Object.assign(process.env, { HOME: made, XDG_STATE_HOME: path.join(made, "state"), LOCALAPPDATA: path.join(made, "local") });
    context.after(() => {
        for (const [key, value] of Object.entries(saved)) { if (value === undefined) { delete process.env[key]; } else { process.env[key] = value; } }
        spawnSync(POSIX ? "chmod" : "cmd", POSIX ? ["-R", "u+rwx", made] : ["/c", "echo"]);
        fs.rmSync(made, { recursive: true, force: true });
    });
    return made;
}

function store(context, { files = localFilesystem(null, null), commands = commandSession(), windows = null } = {}) {
    context.after(() => commands.close?.());
    return workspaceStore(files, commands, windows);
}

// A process that has ended, so its pid names nobody.
function endedPid() { return spawnSync(process.execPath, ["-e", "0"]).pid; }

function rootOf(workspace) { return path.dirname(workspace).replaceAll("\\", "/"); }

test("a workspace is made private, owned, released, and its guard kept only when a command failed", async (context) => {
    home(context);
    const workspaces = await store(context);
    const directory = await workspaces.create();
    assert.ok(JSON.parse(fs.readFileSync(`${directory}/owner.json`, "utf8")).started);
    assert.equal(await workspaces.command(["x"], () => Promise.resolve("ran")), "ran");
    assert.equal(fs.existsSync(`${directory}/command-in-flight`), false);
    await assert.rejects(workspaces.command(["x"], () => Promise.reject(new Error("tool crashed"))), /tool crashed/u);
    assert.equal(fs.existsSync(`${directory}/command-in-flight`), true, "an unsettled command keeps the guard");
    assert.equal(workspaces.canReleaseFiles(), false);
    const unsafe = workspaces.removeWorkspace(directory);
    assert.equal(unsafe.issue.diagnostic.message, message("workspaceUnsafeRemoval"));
    assert.equal(workspaces.removeWorkspace(`${directory}-other`).issue.diagnostic.message, message("workspaceOwnershipUnknown"));
    fs.rmSync(`${directory}/command-in-flight`);
    fs.writeFileSync(`${directory}/retain`, "");
    assert.equal(workspaces.removeWorkspace(directory).state, "failed");
    fs.rmSync(`${directory}/retain`);
    assert.equal(workspaces.removeWorkspace(directory).state, "removed");
});

test("writing a marker again with the same text is fine, and anything else is not", async (context) => {
    home(context);
    const workspaces = await store(context);
    const directory = await workspaces.create();
    workspaces.write(`${directory}/marker`, "one");
    workspaces.write(`${directory}/marker`, "one");
    assert.throws(() => workspaces.write(`${directory}/marker`, "two"), { code: "EEXIST" });
    assert.throws(() => workspaces.write(`${directory}/missing/marker`, "one"), { code: "ENOENT" });
    assert.deepEqual(workspaces.entries(directory).sort(), ["marker", "owner.json"]);
    workspaces.remove(`${directory}/marker`);
    assert.equal(workspaces.removeWorkspace(directory).state, "removed");
});

test("stale workspaces of ended processes are reclaimed, and anything doubtful is left in place", async (context) => {
    home(context);
    const workspaces = await store(context);
    const make = async (change) => {
        const directory = await workspaces.create();
        const owner = JSON.parse(fs.readFileSync(`${directory}/owner.json`, "utf8"));
        fs.rmSync(`${directory}/owner.json`);
        const written = change(directory, owner);
        if (written !== undefined) { fs.writeFileSync(`${directory}/owner.json`, JSON.stringify(written), { mode: 0o600 }); }
        return directory;
    };
    const stale = await make((directory, owner) => ({ ...owner, pid: endedPid() }));
    const alive = await make((directory, owner) => owner);
    const restarted = await make((directory, owner) => ({ ...owner, started: `${owner.started}-earlier` }));
    const retained = await make((directory, owner) => { fs.writeFileSync(`${directory}/retain`, ""); return owner; });
    const foreign = await make((directory, owner) => ({ ...owner, format: "someone-else" }));
    const linked = await make((directory, owner) => { fs.writeFileSync(`${directory}/real.json`, JSON.stringify(owner)); fs.linkSync(`${directory}/real.json`, `${directory}/owner.json`); return undefined; });
    const found = new Map((await workspaces.reclaim()).map((item) => [item.diagnostic.path, item.code]));
    assert.equal(found.get(stale), "workspace-reclaimed");
    assert.equal(found.get(restarted), "workspace-reclaimed", "a pid in use by a later process is not the owner");
    assert.equal(found.has(alive), false);
    assert.equal(found.get(retained), "workspace-retained");
    assert.equal(found.get(foreign), "workspace-unreadable");
    assert.equal(found.get(linked), "workspace-unreadable", "a hard-linked owner record is not trusted");
    assert.equal(fs.existsSync(stale), false);
});

test("a workspace that vanished while it was looked at is no longer anyone's concern", async (context) => {
    home(context);
    const workspaces = await store(context);
    const directory = await workspaces.create();
    const root = rootOf(directory);
    const { readdirSync } = fs;
    context.mock.method(fs, "readdirSync", (target, ...rest) => (String(target).replaceAll("\\", "/") === root ? [...readdirSync(target, ...rest), "run-vanished"] : readdirSync(target, ...rest)));
    const items = await workspaces.reclaim();
    assert.ok(!items.some((item) => item.diagnostic.path.endsWith("run-vanished")));
});

test("a workspace in the wrong place, of the wrong kind, or under a replaced root is refused", { skip: !POSIX }, async (context) => {
    home(context);
    const workspaces = await store(context);
    const directory = await workspaces.create();
    const root = rootOf(directory);
    fs.chmodSync(directory, 0o755);
    assert.equal(workspaces.removeWorkspace(directory).issue.diagnostic.message, message("workspaceNotPrivate"));
    fs.chmodSync(directory, 0o700);
    fs.renameSync(root, `${root}-moved`);
    fs.mkdirSync(root, { mode: 0o700 });
    fs.renameSync(`${root}-moved/${path.basename(directory)}`, directory);
    assert.equal(workspaces.removeWorkspace(directory).issue.diagnostic.message, message("workspaceNamespaceChanged"));
});

test("a root that is not private, or cannot be made, is refused", { skip: !UNPRIVILEGED }, async (context) => {
    const made = home(context);
    const first = await store(context);
    const root = rootOf(await first.create());
    fs.chmodSync(root, 0o755);
    await assert.rejects(store(context), isMessage("workspaceStorageNotPrivate"));
    fs.chmodSync(root, 0o700);
    const blocked = path.join(made, "blocked");
    fs.mkdirSync(blocked, { mode: 0o500 });
    process.env.HOME = blocked;
    process.env.XDG_STATE_HOME = path.join(blocked, "state");
    await assert.rejects(store(context), { code: "EACCES" });
    fs.writeFileSync(`${made}/file`, "");
    assert.throws(() => createParent(localFilesystem(null, null), `${made}/file/child/`), isMessage("workspaceParentUnverified"));
});

test("a parent made by someone else at the same moment is taken as made, unless it is not a folder", { skip: !POSIX }, (context) => {
    const made = home(context);
    const real = localFilesystem(null, null);
    const { mkdirSync } = fs;
    context.mock.method(fs, "mkdirSync", (target, options) => { mkdirSync(target, options); throw Object.assign(new Error("exists"), { code: "EEXIST" }); });
    createParent(real, `${made}/a/b/`);
    assert.ok(fs.statSync(`${made}/a/b`).isDirectory());
    context.mock.method(fs, "mkdirSync", mkdirSync);
    // Missing when looked for, then something other than a folder once made.
    let looked = false;
    const swapped = { checked(file) {
        if (!file.endsWith("/swapped")) { return real.checked(file); }
        if (!looked) { looked = true; throw Object.assign(new Error("missing"), { code: "ENOENT" }); }
        return { kind: "file" };
    } };
    assert.throws(() => createParent(swapped, `${made}/swapped`), isMessage("workspaceParentUnverified"));
});

test("a process's start is read from the system, and a process that is gone or hidden says so", async (context) => {
    const commands = commandSession();
    context.after(() => commands.close());
    assert.ok(await processStart(process.pid, commands, null));
    assert.equal(await processStart(endedPid(), commands, null), null);
    if (UNPRIVILEGED) { assert.equal(await processStart(1, commands, null), undefined, "a process this user may not signal"); }
    const failing = { request: () => Promise.resolve({ status: 1, stdout: "" }) };
    if (process.platform === "darwin") { assert.equal(await processStart(process.pid, failing, null), undefined); }
    const stopping = { request: () => Promise.reject(new UserCanceled()) };
    if (process.platform === "darwin") { await assert.rejects(processStart(process.pid, stopping, null), { name: "UserCanceled" }); }
    await assert.rejects(processStart(process.pid, commands, { startTime: () => Promise.reject(new UserCanceled()) }), { name: "UserCanceled" });
});

test("on Linux, a start time that cannot be read from /proc is not trusted", { skip: process.platform !== "linux" }, async (context) => {
    const commands = commandSession();
    context.after(() => commands.close());
    const { readFileSync } = fs;
    context.mock.method(fs, "readFileSync", (file, ...rest) => (String(file).endsWith("/stat") ? "1 (name) S x" : readFileSync(file, ...rest)));
    assert.equal(await processStart(process.pid, commands, null), undefined);
});

test("a workspace whose owner cannot be told, or whose identity cannot be read, is not made", async (context) => {
    home(context);
    const unknown = await store(context, { commands: { request: () => Promise.resolve({ status: 1, stdout: "" }), close: () => undefined } });
    if (process.platform === "darwin") { await assert.rejects(unknown.create(), isMessage("workspaceOwnerUnknown")); }
    const workspaces = await store(context);
    const { lstatSync } = fs;
    context.mock.method(fs, "lstatSync", (file, options) => {
        const stats = lstatSync(file, options);
        return path.basename(String(file)).startsWith("run-") ? Object.assign(Object.create(Object.getPrototypeOf(stats)), stats, { ino: 0n }) : stats;
    });
    await assert.rejects(workspaces.create(), isMessage("workspaceIdentityUnverified"));
});

test("the Windows helper's view of the root and of each workspace is taken", async (context) => {
    home(context);
    const files = localFilesystem(null, null);
    const helper = (overrides) => ({ local: () => Promise.resolve(true), downloads: () => Promise.resolve(null), privateDirectory: () => Promise.resolve(true), startTime: () => Promise.resolve("start"), ...overrides });
    await assert.rejects(store(context, { files, windows: helper({ local: () => Promise.resolve(false) }) }), isMessage("workspaceParentUnverified"));
    const unverified = { ...files, checked: (file) => (file.endsWith("Workspaces") || file.endsWith("workspaces") ? { kind: "directory", identity: "" } : files.checked(file)) };
    await assert.rejects(store(context, { files: unverified }), isMessage("workspaceStorageUnverified"));
    const windows = helper({});
    const workspaces = await store(context, { files, windows });
    const directory = await workspaces.create();
    const reparse = { ...files, checked: (file) => (file === directory ? { kind: "link" } : files.checked(file)) };
    const viewed = await workspaceStore(reparse, commandSession(), helper({ startTime: () => Promise.resolve("other") }));
    const [item] = await viewed.reclaim();
    assert.equal(item.code, "workspace-unreadable");
});

test("a workspace with no owner record, or an owner the system will not describe, is left in place", { skip: !UNPRIVILEGED }, async (context) => {
    home(context);
    const workspaces = await store(context);
    const unowned = await workspaces.create();
    fs.rmSync(`${unowned}/owner.json`);
    const hidden = await workspaces.create();
    const owner = JSON.parse(fs.readFileSync(`${hidden}/owner.json`, "utf8"));
    fs.rmSync(`${hidden}/owner.json`);
    fs.writeFileSync(`${hidden}/owner.json`, JSON.stringify({ ...owner, pid: 1 }), { mode: 0o600 });
    const found = new Map((await workspaces.reclaim()).map((item) => [item.diagnostic.path, item]));
    assert.equal(found.get(unowned).code, "workspace-unreadable");
    assert.match(found.get(hidden).diagnostic.message, /lifetime/u);
});

test("a workspace removed after it was listed is nobody's concern, and a stop during reclaim is a stop", async (context) => {
    home(context);
    const workspaces = await store(context);
    const gone = await workspaces.create();
    const root = rootOf(gone);
    fs.rmSync(gone, { recursive: true });
    const { readdirSync } = fs;
    context.mock.method(fs, "readdirSync", (target, ...rest) => (String(target).replaceAll("\\", "/") === root ? [path.basename(gone)] : readdirSync(target, ...rest)));
    assert.deepEqual(await workspaces.reclaim(), []);
    context.mock.method(fs, "readdirSync", readdirSync);
    const helper = { local: () => Promise.resolve(true), downloads: () => Promise.resolve(null), privateDirectory: () => Promise.resolve(true), startTime: () => Promise.resolve("start") };
    const watched = await store(context, { windows: helper });
    await watched.create();
    const stopping = await store(context, { windows: { ...helper, startTime: () => Promise.reject(new UserCanceled()) } });
    await assert.rejects(stopping.reclaim(), { name: "UserCanceled" });
});

test("a root whose folder cannot be written in is refused", { skip: !UNPRIVILEGED }, async (context) => {
    home(context);
    const first = await store(context);
    const root = rootOf(await first.create());
    fs.rmSync(root, { recursive: true });
    fs.chmodSync(path.dirname(root), 0o500);
    try { await assert.rejects(store(context), { code: "EACCES" }); }
    finally { fs.chmodSync(path.dirname(root), 0o700); }
});

test("on Windows, a workspace on a drive that does not exist is refused", { skip: POSIX }, (context) => {
    home(context);
    const missing = ["Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"].find((letter) => !fs.existsSync(`${letter}:\\`));
    assert.throws(() => createParent(localFilesystem(null, null), `${missing}:/Image Files to PDF/`), isMessage("workspaceParentUnverified"));
});
