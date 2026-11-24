"use strict";
const { message } = require("../core/messages.js");
const fs = require("node:fs");
const { randomUUID } = require("node:crypto");
const { OperationError } = require("../core/errors.js");
const { issuesOf, ISSUE } = require("../core/outcomes.js");
const { outputName } = require("./paths.js");
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

function claimGroup(directory, name, counter) {
    const marker = `${directory}/${name}`;
    try {
        fs.writeFileSync(marker, String(counter.next), { flag: "wx", mode: PRIVATE_FILE_MODE });
        counter.next += 1;
    } catch (error) { if (error.code !== "EEXIST") { throw error; } }
    const group = fs.readFileSync(marker, "utf8");
    if (!/^\d+$/u.test(group) || Number(group) >= counter.next) { throw new OperationError(message("destinationComparisonTokenUnverified")); }
    return Number(group);
}

function removeNameProbe(directory, owned) {
    const observed = fs.lstatSync(directory, BIGINT);
    if (!observed.isDirectory() || identity(observed) !== owned) { throw new OperationError(message("destinationComparisonDirectoryChanged")); }
    fs.rmSync(directory, { recursive: true });
}

function probeGroups(files, id, scope, counter) {
    const { folder } = scope[0].source;
    const directory = fs.mkdtempSync(`${folder}.ImageFilesToPDF-names-`);
    const owned = identity(fs.lstatSync(directory, BIGINT));
    let groups = [];
    let failure = null;
    try {
        if (!owned || id !== files.directoryIdentity(folder)) { throw new OperationError(message("destinationComparisonUnavailable")); }
        groups = scope.map(({ source, index }) => [index, claimGroup(directory, outputName(source), counter)]);
    } catch (error) { failure = error; }
    try { removeNameProbe(directory, owned); }
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

function destinationOperations(files, mac, windows) {
    const parents = new Map();
    function link(from, to) {
        parents.delete(to);
        try {
            const directory = files.directoryIdentity(dirname(to));
            fs.linkSync(from, to);
            parents.set(to, directory);
            return { state: "created" };
        } catch (error) {
            let state = CLAIM_ERRORS[error.code] ?? "unknown";
            if (state === "exists" && !fs.lstatSync(to, { throwIfNoEntry: false })) { state = "unknown"; }
            return { state, diagnostic: { code: error.code, message: error.message } };
        }
    }

    async function rename(from, to) {
        const directory = files.directoryIdentity(dirname(to));
        const original = facts(from);
        const reported = mac ? await mac.request({ type: "renameExclusive", from, to }) : await windows.move(from, to);
        const remaining = facts(from);
        const target = facts(to);
        if (!remaining.identity && same(target, original)) {
            parents.set(to, directory);
            return { state: "created" };
        }
        if (!same(remaining, original)) { return { state: "unknown", diagnostic: reported }; }
        if (fs.lstatSync(to, { throwIfNoEntry: false })) { return { state: "exists" }; }
        const state = reported?.status === -1 ? MAC_RENAME_ERRORS[reported.errno] ?? "unknown" : "unknown";
        return { state, diagnostic: reported };
    }

    function actualPath(file, expected) {
        const folder = dirname(file), requested = basename(file);
        const directory = parents.get(file) ?? files.directoryIdentity(folder);
        if (directory !== files.directoryIdentity(folder) || !same(facts(file), expected)) {
            throw new OperationError(message("publishedPdfIdentityUnverified"));
        }
        const entries = storedNames(folder);
        const candidates = entries.includes(requested) ? [requested] : entries.filter((name) => name.normalize("NFC") === requested.normalize("NFC"));
        const matching = candidates.map((name) => folder + name).filter((candidate) => same(facts(candidate), expected));
        if (matching.length !== 1 || !same(facts(file), expected) || !same(facts(matching[0]), expected) || directory !== files.directoryIdentity(folder)) {
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

    return {
        publication: { facts, link, actualPath, ...(mac || windows ? { rename } : {}) },
        operations: { stagingArea, openStaging, closeStaging,
            copyBeside: (from, to) => fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL) },
        destinationNames: { groups: (sources) => nameGroups(files, sources) }
    };
}

module.exports = { destinationOperations, cleanupIssue };
