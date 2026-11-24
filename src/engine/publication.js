"use strict";
const { message } = require("../core/messages.js");
const fs = require("node:fs");
const { randomUUID } = require("node:crypto");
const { OperationError } = require("../core/errors.js");
const { issuesOf, ISSUE } = require("../core/outcomes.js");
const { outputName } = require("./paths.js");
const { windowsClaim } = require("./platform/windows-claim.js");
const { basename, dirname } = require("../core/paths.js");
const { pdfFacts, storedNames, identity, BIGINT, UNKNOWN_FILE } = require("./filesystem.js");

const PRIVATE_FILE_MODE = 0o600;
const CLAIM_ERRORS = {
    EEXIST: "exists", EXDEV: "cross-device", ENOTSUP: "unsupported", ENOSYS: "unsupported",
    EACCES: "denied", EPERM: "denied", EROFS: "denied", ENOENT: "denied", ENOTDIR: "denied", ENOSPC: "denied"
};

function same(actual, expected) {
    return Boolean(actual.identity) && actual.identity === expected.identity && actual.size === expected.size;
}

function facts(file) {
    try { return pdfFacts(file); }
    catch (error) { if (error.code === "ENOENT" || error.code === "ENOTDIR") { return UNKNOWN_FILE; } throw error; }
}

function cleanupIssue(error, path) {
    const [issue] = issuesOf(error, "cleanup");
    return { ...issue, code: ISSUE.cleanup, diagnostic: { path, message: error.message } };
}

function claimGroup(directory, name, counter, markers) {
    const marker = `${directory}/${name}`;
    try {
        const fd = fs.openSync(marker, "wx", PRIVATE_FILE_MODE);
        try {
            fs.writeFileSync(fd, String(counter.next));
            counter.next += 1;
        } finally {
            // FAT can assign the permanent inode when the first bytes are written.
            try { markers.set(marker, identity(fs.fstatSync(fd, BIGINT))); }
            finally { fs.closeSync(fd); }
        }
    } catch (error) { if (error.code !== "EEXIST") { throw error; } }
    const group = fs.readFileSync(marker, "utf8");
    if (!/^\d+$/u.test(group) || Number(group) >= counter.next) { throw new OperationError(message("destinationComparisonTokenUnverified")); }
    return Number(group);
}

function removeNameProbe(directory, owned, markers) {
    const observed = fs.lstatSync(directory, BIGINT);
    if (!observed.isDirectory() || identity(observed) !== owned) { throw new OperationError(message("destinationComparisonDirectoryChanged")); }
    // Removing the original name also removes macOS AppleDouble companions.
    for (const [marker, id] of markers) {
        const token = fs.lstatSync(marker, BIGINT);
        if (!id || !token.isFile() || identity(token) !== id) {
            throw new OperationError(message("destinationComparisonTokenUnverified"));
        }
        fs.unlinkSync(marker);
    }
    fs.rmdirSync(directory);
}

function probeGroups(files, id, scope, counter) {
    const { folder } = scope[0].source;
    const directory = fs.mkdtempSync(`${folder}.ImageFilesToPDF-names-`);
    const owned = identity(fs.lstatSync(directory, BIGINT));
    const markers = new Map();
    let groups = [];
    let failure = null;
    try {
        if (!owned || id !== files.directoryIdentity(folder)) { throw new OperationError(message("destinationComparisonUnavailable")); }
        groups = scope.map(({ source, index }) => [index, claimGroup(directory, outputName(source), counter, markers)]);
    } catch (error) { failure = error; }
    try { removeNameProbe(directory, owned, markers); }
    catch (error) {
        const issues = failure ? issuesOf(failure, "planning") : [];
        throw new OperationError(message("destinationComparisonDirectoryRemovalFailed"), { issues: [...issues, cleanupIssue(error, directory)] });
    }
    if (failure) { throw failure; }
    return groups;
}

function nameGroups(files, sources) {
    const scopes = new Map();
    const groups = new Array(sources.length);
    for (const [index, source] of sources.entries()) {
        const id = files.directoryIdentity(source.folder);
        const scope = scopes.get(id) ?? [];
        scope.push({ index, source });
        scopes.set(id, scope);
    }
    const counter = { next: 0 };
    for (const [id, scope] of scopes) {
        if (scope.length === 1) {
            groups[scope[0].index] = counter.next;
            counter.next += 1;
        } else {
            for (const [index, group] of probeGroups(files, id, scope, counter)) { groups[index] = group; }
        }
    }
    return groups;
}

const MAC_RENAME_ERRORS = { 1: "denied", 13: "denied", 18: "cross-device", 30: "denied", 45: "unsupported", 78: "unsupported" };

function windowsLinkRefusal(from, to) {
    const target = fs.lstatSync(to, { throwIfNoEntry: false, bigint: true });
    const source = facts(from);
    if (!source.identity) { return "unknown"; }
    if (!target) { return "unsupported"; }
    const id = identity(target);
    return id && id !== source.identity ? "exists" : "unknown";
}

function linkClaim(files, windows, parents) {
    return function link(from, to) {
        parents.delete(to);
        let linking = false;
        try {
            const directory = files.directoryIdentity(dirname(to));
            linking = true;
            fs.linkSync(from, to);
            parents.set(to, { directory });
            return { state: "created" };
        } catch (error) {
            let state = CLAIM_ERRORS[error.code] ?? "unknown";
            if (state === "exists" && !fs.lstatSync(to, { throwIfNoEntry: false })) { state = "unknown"; }
            if (windows && linking && error.code === "EISDIR") {
                // libuv can report EISDIR for Windows ERROR_INVALID_FUNCTION on a hard link.
                try {
                    state = windowsLinkRefusal(from, to);
                } catch { state = "unknown"; }
            }
            return { state, diagnostic: { code: error.code, message: error.message } };
        }
    };
}

function destinationOperations(files, mac, windows) {
    const parents = new Map();
    const link = linkClaim(files, windows, parents);

    async function rename(from, to) {
        const directory = files.directoryIdentity(dirname(to));
        const original = facts(from);
        const reported = await mac.request({ type: "renameExclusive", from, to });
        const remaining = facts(from);
        const target = facts(to);
        if (!fs.lstatSync(from, { throwIfNoEntry: false }) && same(target, original)) {
            parents.set(to, { directory });
            return { state: "created" };
        }
        if (!same(remaining, original)) { return { state: "unknown", diagnostic: reported }; }
        if (fs.lstatSync(to, { throwIfNoEntry: false })) { return { state: "exists" }; }
        const state = reported?.status === -1 ? MAC_RENAME_ERRORS[reported.errno] ?? "unknown" : "unknown";
        return { state, diagnostic: reported };
    }

    function actualPath(file, expected) {
        const folder = dirname(file), requested = basename(file);
        const claim = parents.get(file);
        const directory = claim?.directory ?? files.directoryIdentity(folder);
        if (directory !== files.directoryIdentity(folder) || !same(facts(file), expected)) {
            throw new OperationError(message("publishedPdfIdentityUnverified"));
        }
        const entries = storedNames(folder);
        const candidates = entries.includes(requested) ? [requested] : entries.filter((name) => name.normalize("NFC") === requested.normalize("NFC"));
        const matching = candidates.map((name) => folder + name).filter((candidate) => same(facts(candidate), expected));
        if ((claim?.held && !same(claim.held(), expected)) || matching.length !== 1 || !same(facts(file), expected) || !same(facts(matching[0]), expected) || directory !== files.directoryIdentity(folder)) {
            throw new OperationError(message("publishedPdfNameAmbiguous"));
        }
        parents.delete(file);
        return matching[0];
    }

    function stagingArea(file) {
        const directory = `${dirname(file)}.ImageFilesToPDF-${randomUUID()}`;
        return { directory, file: `${directory}/ready.pdf`, owned: "" };
    }

    function openStaging(area) {
        fs.mkdirSync(area.directory, { mode: 0o700 });
        area.owned = identity(fs.lstatSync(area.directory, BIGINT));
        if (!area.owned) { throw new OperationError(message("stagingDirectoryUnverified")); }
    }

    function closeStaging(area) {
        try {
            const stat = fs.lstatSync(area.directory, BIGINT);
            if (stat.isDirectory() && area.owned === identity(stat)) {
                fs.rmSync(area.file, { force: true });
                fs.rmdirSync(area.directory);
                return [];
            }
            throw new OperationError(message("stagingDirectoryOwnershipLost"));
        } catch (error) { return [cleanupIssue(error, area.directory)]; }
    }

    const exclusiveRename = windows ? windowsClaim(windows, files.directoryIdentity, facts, (file, directory, held) => {
        parents.set(file, { directory, held });
    }) : rename;
    return {
        publication: { facts, link, actualPath, ...(windows || mac ? { rename: exclusiveRename } : {}) },
        operations: { stagingArea, openStaging, closeStaging,
            copyBeside: (from, to) => fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL) },
        destinationNames: { groups: (sources) => nameGroups(files, sources) }
    };
}

module.exports = { destinationOperations, cleanupIssue };
