"use strict";
const { message: wording } = require("../core/messages.js");
const fs = require("node:fs");
const os = require("node:os");
const { getuid, pid, platform, kill } = require("node:process");
const { OperationError } = require("../core/errors.js");
const { issuesOf, ISSUE } = require("../core/outcomes.js");
const { validWorkspaceOwner } = require("../core/workspaces.js");
const { dirname } = require("../core/paths.js");
const { standardize } = require("./paths.js");
const { identity, BIGINT } = require("./filesystem.js");
const { MAC_PS } = require("./executables.js");

const TAG = "image-files-to-pdf-node-1";
const NAME = /^run-[a-zA-Z0-9]{6}$/u;
const OWNER = "owner.json";
const IN_FLIGHT = "command-in-flight";
const RETAIN = "retain";
const OWNER_LIMIT = 4096;
const PROC_NAME_DELIMITER_LENGTH = 2;
const PROC_START_INDEX = 19;
const GROUP_AND_OTHER = 0o077n;
const NO_PERMISSIONS = 0n;
const SINGLE_LINK = 1n;
const PRIVATE_FILE_MODE = 0o600;

function processStart(owner, commands, windows) {
    try {
        kill(owner, 0);
        if (windows) { return windows.startTime(owner); }
        if (platform === "linux") {
            const stat = fs.readFileSync(`/proc/${owner}/stat`, "utf8");
            // The process name is parenthesized and can itself contain a closing parenthesis.
            const ticks = stat.slice(stat.lastIndexOf(")") + PROC_NAME_DELIMITER_LENGTH).split(" ").at(PROC_START_INDEX);
            const boot = fs.readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim();
            return /^\d+$/u.test(ticks) && boot ? `${boot}:${ticks}` : undefined;
        }
        const snapshot = commands.request([MAC_PS, "-p", String(owner), "-o", "lstart="]);
        return snapshot.status === 0 && snapshot.stdout.trim() ? snapshot.stdout.trim() : undefined;
    } catch (error) { return error.code === "ESRCH" ? null : undefined; }
}

function privateMode(stats) {
    // eslint-disable-next-line no-bitwise -- File mode bits are independent.
    return stats.uid === BigInt(getuid()) && (stats.mode & GROUP_AND_OTHER) === NO_PERMISSIONS;
}

function createPrivateRoot(files, windows) {
    const base = windows ? standardize(`${os.homedir()}/AppData/Local`) : standardize(fs.realpathSync.native(os.tmpdir()));
    if (files.checked(base, { owned: true }).kind !== "directory") { throw new OperationError(wording("workspaceParentUnverified")); }
    const root = `${base}/${TAG}${windows ? "" : `-${getuid()}`}`;
    let created = false;
    try { fs.mkdirSync(root, { mode: 0o700 }); created = true; }
    catch (error) { if (error.code !== "EEXIST") { throw error; } }
    const found = files.checked(root, { owned: true });
    if (found.kind !== "directory" || !found.identity) { throw new OperationError(wording("workspaceStorageUnverified")); }
    if (windows) { windows.privateDirectory(root, created); }
    else if (!privateMode(found.stats)) { throw new OperationError(wording("workspaceStorageNotPrivate")); }
    return root;
}

function writeNew(file, text) {
    const fd = fs.openSync(file, "wx", PRIVATE_FILE_MODE);
    try { fs.writeFileSync(fd, text, "utf8"); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
}

function present(file) { return Boolean(fs.lstatSync(file, { throwIfNoEntry: false })); }

function ownerOfMarker(file) {
    const stats = fs.lstatSync(file, BIGINT);
    return stats.isFile() && stats.nlink === SINGLE_LINK && stats.size <= BigInt(OWNER_LIMIT) ? fs.readFileSync(file, "utf8") : null;
}

function ownerAt(file) {
    return JSON.parse(ownerOfMarker(file));
}

function diagnostic(path, code, message, detail) {
    return { code: `workspace-${code}`, stage: "workspace", message, diagnostic: { path, ...(detail ? { message: detail } : {}) } };
}
function reclaimCandidate(directory, { commands, inspect, release, windows }, files) {
    try {
        const stat = inspect(directory);
        if (windows && files.checked(directory, { owned: true }).kind !== "directory") { throw new Error("The workspace is a reparse point."); }
        if (present(`${directory}/${RETAIN}`) || present(`${directory}/${IN_FLIGHT}`)) {
            return diagnostic(directory, "retained", "A retained or possibly active workspace was left in place.");
        }
        const owner = ownerAt(`${directory}/${OWNER}`);
        if (owner?.format !== TAG || !validWorkspaceOwner(owner) || owner.identity !== identity(stat)) {
            throw new Error("Workspace ownership could not be established.");
        }
        const started = processStart(owner.pid, commands, windows);
        if (started === undefined) { throw new Error("Workspace process lifetime could not be established."); }
        if (started === owner.started) { return null; }
        release(directory, owner.identity);
        return diagnostic(directory, "reclaimed", "A stale workspace was reclaimed.");
    } catch (error) {
        if (error.code === "ENOENT" && !present(directory)) { return null; }
        return diagnostic(directory, "unreadable", "A workspace could not be verified and was left in place.", error.message);
    }
}

function workspaceStore(files, commands, windows) {
    const root = createPrivateRoot(files, windows);
    const rootIdentity = identity(fs.lstatSync(root, BIGINT));
    let current = null;
    function inspect(directory) {
        if (dirname(directory) !== `${root}/` || !NAME.test(directory.slice(root.length + 1)) ||
            rootIdentity !== identity(fs.lstatSync(root, BIGINT))) {
            throw new OperationError(wording("workspaceNamespaceChanged"));
        }
        const stats = fs.lstatSync(directory, BIGINT);
        if (!stats.isDirectory() || (!windows && !privateMode(stats))) { throw new OperationError(wording("workspaceNotPrivate")); }
        return stats;
    }
    function release(directory, expected) {
        if (identity(inspect(directory)) !== expected || present(`${directory}/${IN_FLIGHT}`) || present(`${directory}/${RETAIN}`)) {
            throw new OperationError(wording("workspaceUnsafeRemoval"));
        }
        fs.rmSync(directory, { recursive: true });
    }
    return {
        downloads: `${standardize(`${os.homedir()}/Downloads`)}/`,
        entries: (directory) => fs.readdirSync(directory),
        write(file, text) {
            try { writeNew(file, text); }
            catch (error) {
                if (error.code !== "EEXIST" || ownerOfMarker(file) !== text) { throw error; }
            }
        },
        remove: (file) => fs.unlinkSync(file),
        create() {
            const started = processStart(pid, commands, windows);
            if (!started) { throw new OperationError(wording("workspaceOwnerUnknown")); }
            const directory = standardize(fs.mkdtempSync(`${root}/run-`));
            const id = identity(inspect(directory));
            if (!id) { throw new OperationError(wording("workspaceIdentityUnverified")); }
            writeNew(`${directory}/${OWNER}`, JSON.stringify({ format: TAG, identity: id, pid, started }));
            current = { directory, id };
            return directory;
        },
        removeWorkspace(directory) {
            try {
                if (current?.directory !== directory) { throw new OperationError(wording("workspaceOwnershipUnknown")); }
                release(directory, current.id);
                current = null;
                return { state: "removed" };
            } catch (error) {
                const [issue] = issuesOf(error, "cleanup");
                return { state: "failed", issue: { ...issue, code: ISSUE.cleanup, diagnostic: { path: directory, message: error.message } } };
            }
        },
        reclaim() {
            const ports = { commands, inspect, release, windows };
            return fs.readdirSync(root).filter((name) => NAME.test(name))
                .map((name) => reclaimCandidate(`${root}/${name}`, ports, files)).filter(Boolean);
        },
        canReleaseFiles() { return !current || !present(`${current.directory}/${IN_FLIGHT}`); },
        command(argv, request) {
            if (!current) { return request(argv); }
            const guard = `${current.directory}/${IN_FLIGHT}`;
            writeNew(guard, "Native command settlement has not been acknowledged.\n");
            // The guard is removed only after a correlated reply following child close.
            // If either thread or the process dies, future runs leave the workspace alone.
            const result = request(argv);
            fs.unlinkSync(guard);
            return result;
        }
    };
}

module.exports = { workspaceStore };
