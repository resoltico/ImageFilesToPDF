"use strict";
const { message } = require("../core/messages.js");
const fs = require("node:fs");
const path = require("node:path");
const { platform } = require("node:process");
const { Buffer } = require("node:buffer");
const { TextDecoder } = require("node:util");
const { OperationError, isUserCanceled } = require("../core/errors.js");
const { captureIssue, changedSourceIssue } = require("../core/source-policy.js");
const { ordinaryWindowsPath } = require("./path-syntax.js");
const { WINDOWS, standardize } = require("./paths.js");
const { countPng } = require("../core/png-count.js");
const { SIGNATURE_BYTES } = require("../core/raster-signatures.js");
const { crc32 } = require("node:zlib");

const BIGINT = { bigint: true };
const DECODER = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const BLOCK_SIZE = 1048576;
const MAC_SYSTEM_ALIASES = new Map([["/tmp", "/private/tmp"], ["/var", "/private/var"]]);
const PRIVATE_FILE_MODE = 0o600;
const NO_INODE = 0n;
const UNKNOWN_FILE = Object.freeze({ identity: "", size: -1 });

function identity(stats) {
    return stats?.ino > NO_INODE ? `${stats.dev}:${stats.ino}` : "";
}

function fileFacts(stats) {
    const id = stats?.isFile() ? identity(stats) : "";
    if (!id) { throw new OperationError(message("sourceIdentityUnverified")); }
    return { identity: id, size: String(stats.size), version: [stats.mtimeNs, stats.ctimeNs, stats.birthtimeNs, stats.size].join(":") };
}

function sameFile(left, right) { return left.identity === right.identity && left.version === right.version; }

function pathPrefixes(file) {
    const { root } = path.parse(file);
    let prefix = root.replace(/\\/gu, "/");
    return [prefix, ...file.slice(root.length).split("/").filter(Boolean).map((part) => {
        prefix = `${prefix.endsWith("/") ? prefix : `${prefix}/`}${part}`;
        return prefix;
    })];
}

function kindOf(stats) {
    if (stats.isSymbolicLink()) { return "link"; }
    if (stats.isDirectory()) { return "directory"; }
    return stats.isFile() ? "file" : "other";
}

async function macKind(mac, prefixes, leaf, leafKind) {
    // checkedPath already verifies the two macOS system symlinks by their exact targets.
    const paths = [...prefixes.filter((part) => !MAC_SYSTEM_ALIASES.has(part)), leaf];
    const records = await mac.request({ type: "packages", paths });
    if (!Array.isArray(records) || records.length !== paths.length || records.some((record) =>
        typeof record?.package !== "boolean" || typeof record?.alias !== "boolean")) { return "unexaminable"; }
    if (records.some((record) => record.alias)) { return "link"; }
    return records.some((record) => record.package) ? "package" : leafKind;
}

function checkedPath(file) {
    const prefixes = pathPrefixes(standardize(file));
    const leaf = prefixes.pop();
    for (const part of prefixes) {
        const stats = fs.lstatSync(part, BIGINT);
        if (!stats.isDirectory()) {
            const macAlias = platform === "darwin" && MAC_SYSTEM_ALIASES.get(part);
            if (!macAlias || !stats.isSymbolicLink() || fs.realpathSync.native(part) !== macAlias) {
                return { kind: stats.isSymbolicLink() ? "link" : "unexaminable" };
            }
        }
    }
    const stats = fs.lstatSync(leaf, BIGINT);
    return { stats, kind: kindOf(stats), prefixes, leaf, identity: identity(stats) };
}

function changedSource(file) {
    const issue = changedSourceIssue(file);
    return new OperationError(message("fileIssue", { path: file, reason: issue.message }), { issues: [issue] });
}

function copyHandle(fd, out, size) {
    if (!Number.isSafeInteger(size)) { throw new OperationError(message("sourceSizeUnrepresentable")); }
    const data = Buffer.allocUnsafe(BLOCK_SIZE);
    const prefix = Buffer.alloc(Math.min(SIGNATURE_BYTES, size));
    for (let position = 0; position < size;) {
        const read = fs.readSync(fd, data, 0, Math.min(data.length, size - position), position);
        if (!read) { throw new OperationError(message("sourceEndedDuringCapture")); }
        if (position < prefix.length) { data.copy(prefix, position, 0, Math.min(read, prefix.length - position)); }
        for (let offset = 0; offset < read;) {
            const written = fs.writeSync(out, data, offset, read - offset);
            if (!written) { throw new OperationError(message("privateCopyUnwritable")); }
            offset += written;
        }
        position += read;
    }
    if (fs.fstatSync(out, BIGINT).size !== BigInt(size)) { throw new OperationError(message("privateCopySizeUnverified")); }
    return prefix;
}

function storedNames(directory) {
    return fs.readdirSync(directory, { encoding: "buffer" }).map((name) => {
        try {
            const decoded = DECODER.decode(name);
            return decoded.includes("\uFFFD") || (WINDOWS && !ordinaryWindowsPath(decoded)) ? null : decoded;
        } catch { return null; }
    }).filter((name) => name !== null);
}

function readable(file) {
    try { fs.accessSync(file, fs.constants.R_OK); return true; }
    catch { return false; }
}

function readPng(fd, size) {
    return countPng({
        checksum: crc32,
        read(position, length) {
            const data = Buffer.alloc(length);
            return data.subarray(0, fs.readSync(fd, data, 0, length, position));
        }
    }, size);
}

function readPrefix(fd, size) {
    const bytes = Buffer.alloc(Math.min(SIGNATURE_BYTES, Number(size)));
    for (let offset = 0; offset < bytes.length;) {
        const read = fs.readSync(fd, bytes, offset, bytes.length - offset, offset);
        if (read === 0) { throw new OperationError(message("sourceAttributesUnavailable")); }
        offset += read;
    }
    return bytes;
}

function listedMacKind(record, kind) {
    if (typeof record?.package !== "boolean" || typeof record?.alias !== "boolean") { return "unexaminable"; }
    if (record.alias) { return "link"; }
    return record.package ? "package" : kind;
}

function sourceOperations(checkedSource) {
    async function facts(file) {
        try {
            const found = await checkedSource(file);
            return fileFacts(found.kind === "file" ? found.stats : null);
        } catch (error) {
            if (error instanceof OperationError || isUserCanceled(error)) { throw error; }
            throw new OperationError(message("sourceAttributesUnavailable"), { cause: error });
        }
    }

    async function withSource(file, use) {
        const before = await facts(file);
        // POSIX flags reject a leaf symlink and prevent a raced FIFO from blocking.
        // eslint-disable-next-line no-bitwise -- These are independent native open flags.
        const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0);
        const fd = fs.openSync(file, flags);
        try {
            const opened = fileFacts(fs.fstatSync(fd, BIGINT));
            if (!sameFile(before, opened) || !sameFile(opened, await facts(file))) { throw changedSource(file); }
            const result = use(fd, opened);
            if (!sameFile(opened, fileFacts(fs.fstatSync(fd, BIGINT))) || !sameFile(opened, await facts(file))) { throw changedSource(file); }
            return result;
        } finally { fs.closeSync(fd); }
    }

    async function capture(file, destination) {
        try {
            return await withSource(file, (fd, opened) => {
                const out = fs.openSync(destination, "wx", PRIVATE_FILE_MODE);
                try {
                    const capturedPrefix = copyHandle(fd, out, Number(opened.size));
                    return { path: destination, identity: opened.identity, version: opened.version, prefix: capturedPrefix };
                }
                finally { fs.closeSync(out); }
            });
        } catch (error) {
            if (error.issues || isUserCanceled(error)) { throw error; }
            const issue = captureIssue(file, { message: error.message });
            throw new OperationError(message("fileIssue", { path: file, reason: issue.message }), { cause: error, issues: [issue] });
        }
    }

    async function prefix(file, expected) {
        try {
            return await withSource(file, (fd, opened) => {
                if (!sameFile(expected, opened)) { throw changedSource(file); }
                return readPrefix(fd, opened.size);
            });
        } catch (error) {
            if (error instanceof OperationError || isUserCanceled(error)) { throw error; }
            throw new OperationError(message("sourceAttributesUnavailable"), { cause: error });
        }
    }

    return { facts, capture, readable, prefix, pngCount: (file) => withSource(file, (fd, opened) => readPng(fd, Number(opened.size))) };
}

function localFilesystem(windows, mac) {
    const folderFacts = new Map();
    const checked = (file) => checkedPath(file);
    async function checkedSource(file, listed = false) {
        if (windows && !await windows.local(file)) { return { kind: "unexaminable" }; }
        const found = checked(file);
        if (!mac || !["file", "directory"].includes(found.kind)) { return found; }
        const prior = listed ? folderFacts.get(file) : null;
        if (prior?.identity === found.identity && prior.changed === found.stats.ctimeNs) { return { ...found, kind: prior.kind }; }
        return { ...found, kind: await macKind(mac, found.prefixes, found.leaf, found.kind) };
    }

    async function inspect(file) {
        try {
            const found = await checkedSource(file, true);
            return { kind: found.kind, identity: found.identity, hidden: found.hidden };
        } catch (error) {
            if (isUserCanceled(error)) { throw error; }
            const kind = { ENOENT: "missing", ENOTDIR: "missing", EACCES: "unreadable", EPERM: "unreadable" }[error.code];
            return { kind: kind ?? "unexaminable" };
        }
    }

    async function rememberDirectoryFacts(directory, names) {
        const children = names.flatMap((name) => {
            const file = standardize(`${directory}/${name}`);
            try {
                const found = checked(file);
                return ["file", "directory"].includes(found.kind) ? [{ file, ...found }] : [];
            } catch { return []; }
        });
        if (children.length === 0) { return; }
        const records = await mac.request({ type: "packages", paths: children.map(({ file }) => file) });
        if (!Array.isArray(records) || records.length !== children.length) { throw new Error("The macOS directory facts were incomplete."); }
        children.forEach(({ file, identity: id, stats, kind }, index) =>
            folderFacts.set(file, { identity: id, changed: stats.ctimeNs, kind: listedMacKind(records[index], kind) }));
    }

    async function entries(directory) {
        try {
            if ((await checkedSource(directory, true)).kind !== "directory") { return null; }
            const names = storedNames(directory);
            if (mac) { await rememberDirectoryFacts(directory, names); }
            if (!windows) { return names; }
            const listed = await windows.entries(directory);
            const visible = new Set(listed.filter((entry) => entry.hidden === false).map((entry) => entry.name));
            return names.filter((name) => visible.has(name));
        } catch (error) {
            if (isUserCanceled(error)) { throw error; }
            return null;
        }
    }

    function directoryIdentity(directory) {
        const found = checked(directory);
        if (found.kind !== "directory" || !found.identity) { throw new OperationError(message("destinationDirectoryUnverified", { directory })); }
        return found.identity;
    }

    return {
        checked, directoryIdentity,
        tree: { inspect, entries, standardize },
        sources: sourceOperations(checkedSource)
    };
}

function pdfFacts(file) {
    const stats = fs.lstatSync(file, BIGINT);
    const size = Number(stats.size);
    return stats.isFile() && Number.isSafeInteger(size) ? { identity: identity(stats), size } : UNKNOWN_FILE;
}
module.exports = { localFilesystem, pdfFacts, storedNames, identity, BIGINT, UNKNOWN_FILE };
