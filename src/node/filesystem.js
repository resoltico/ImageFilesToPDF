"use strict";
const { message } = require("../core/messages.js");
const fs = require("node:fs");
const path = require("node:path");
const { platform } = require("node:process");
const { Buffer } = require("node:buffer");
const { TextDecoder } = require("node:util");
const { OperationError } = require("../core/errors.js");
const { captureIssue, changedSourceIssue } = require("../core/source-policy.js");
const { WINDOWS, standardize, ordinaryWindowsPath } = require("./paths.js");
const { countPng } = require("../core/png-count.js");
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

function macKind(mac, prefixes, leaf, leafKind) {
    // checkedPath already verifies the two macOS system symlinks by their exact targets.
    const paths = [...prefixes.filter((part) => !MAC_SYSTEM_ALIASES.has(part)), leaf];
    const records = mac({ type: "packages", paths });
    if (!Array.isArray(records) || records.length !== paths.length || records.some((record) =>
        typeof record?.package !== "boolean" || typeof record?.alias !== "boolean")) { return "unexaminable"; }
    if (records.some((record) => record.alias)) { return "link"; }
    return records.some((record) => record.package) ? "package" : leafKind;
}

function checkedPath(windows, mac, file, { owned = false } = {}) {
    const prefixes = pathPrefixes(standardize(file));
    const leaf = prefixes.pop();
    const attributes = windows ? windows.attributes(leaf) : "ordinary";
    if (attributes === "missing" || attributes === "link") { return { kind: attributes }; }
    if (!["ordinary", "hidden"].includes(attributes)) { throw new OperationError(message("nativeFileAttributesUnavailable"), { diagnostic: { attributes } }); }
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
    const observed = kindOf(stats);
    const kind = mac && !owned && ["file", "directory"].includes(observed) ? macKind(mac, prefixes, leaf, observed) : observed;
    return { stats, kind, hidden: attributes === "hidden", identity: identity(stats) };
}

function changedSource(file) {
    const issue = changedSourceIssue(file);
    return new OperationError(message("fileIssue", { path: file, reason: issue.message }), { issues: [issue] });
}

function copyHandle(fd, out, size) {
    if (!Number.isSafeInteger(size)) { throw new OperationError(message("sourceSizeUnrepresentable")); }
    const data = Buffer.allocUnsafe(BLOCK_SIZE);
    for (let position = 0; position < size;) {
        const read = fs.readSync(fd, data, 0, Math.min(data.length, size - position), position);
        if (!read) { throw new OperationError(message("sourceEndedDuringCapture")); }
        for (let offset = 0; offset < read;) {
            const written = fs.writeSync(out, data, offset, read - offset);
            if (!written) { throw new OperationError(message("privateCopyUnwritable")); }
            offset += written;
        }
        position += read;
    }
    if (fs.fstatSync(out, BIGINT).size !== BigInt(size)) { throw new OperationError(message("privateCopySizeUnverified")); }
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

function localFilesystem(windows, mac) {
    const checked = (file, options) => checkedPath(windows, mac, file, options);
    function inspect(file) {
        try {
            const found = checked(file);
            return { kind: found.kind, identity: found.identity, hidden: found.hidden };
        } catch (error) {
            const kind = { ENOENT: "missing", ENOTDIR: "missing", EACCES: "unreadable", EPERM: "unreadable" }[error.code];
            return { kind: kind ?? "unexaminable" };
        }
    }

    function entries(directory) {
        try {
            if (checked(directory).kind !== "directory") { return null; }
            return storedNames(directory);
        } catch { return null; }
    }

    function facts(file) {
        try {
            const found = checked(file);
            return fileFacts(found.kind === "file" ? found.stats : null);
        } catch (error) {
            if (error instanceof OperationError) { throw error; }
            throw new OperationError(message("sourceAttributesUnavailable"), { cause: error });
        }
    }

    function withSource(file, use) {
        const before = facts(file);
        // POSIX flags reject a leaf symlink and prevent a raced FIFO from blocking.
        // eslint-disable-next-line no-bitwise -- These are independent native open flags.
        const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0);
        const fd = fs.openSync(file, flags);
        try {
            const opened = fileFacts(fs.fstatSync(fd, BIGINT));
            if (!sameFile(before, opened) || !sameFile(opened, facts(file))) { throw changedSource(file); }
            const result = use(fd, opened);
            if (!sameFile(opened, fileFacts(fs.fstatSync(fd, BIGINT))) || !sameFile(opened, facts(file))) { throw changedSource(file); }
            return result;
        } finally { fs.closeSync(fd); }
    }

    function capture(file, destination) {
        try {
            return withSource(file, (fd, opened) => {
                const out = fs.openSync(destination, "wx", PRIVATE_FILE_MODE);
                try { copyHandle(fd, out, Number(opened.size)); }
                finally { fs.closeSync(out); }
                return { path: destination, identity: opened.identity, version: opened.version };
            });
        } catch (error) {
            if (error.issues) { throw error; }
            const issue = captureIssue(file, { message: error.message });
            throw new OperationError(message("fileIssue", { path: file, reason: issue.message }), { cause: error, issues: [issue] });
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
        sources: { facts, capture,
            readable,
            pngCount: (file) => withSource(file, (fd, opened) => readPng(fd, Number(opened.size)))
        }
    };
}

function pdfFacts(file) {
    const stats = fs.lstatSync(file, BIGINT);
    const size = Number(stats.size);
    return stats.isFile() && Number.isSafeInteger(size) ? { identity: identity(stats), size } : UNKNOWN_FILE;
}
module.exports = { localFilesystem, pdfFacts, storedNames, identity, BIGINT, UNKNOWN_FILE };
