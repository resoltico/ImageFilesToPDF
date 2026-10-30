"use strict";
const { OperationError } = require("../core/errors.js");
const { issuesOf, ISSUE } = require("../core/outcomes.js");
const { fileStem, dirname } = require("../core/paths.js");
const { outputNameForSeparate } = require("../core/naming.js");
const { attributesAt, identityOf, kindOf, attributeText } = require("./native-file-attributes.js");

function comparisonError(folder) {
    return new OperationError(`Output names could not be compared in this destination: ${folder}`);
}

function resource(runtime, url, key) {
    const values = url.resourceValuesForKeysError(runtime.ns([key]), runtime.ref());
    if (!values || values.isNil()) { throw comparisonError(String(runtime.objc.unwrap(url.path))); }
    const value = values.objectForKey(key);
    if (!value || value.isNil()) { throw comparisonError(String(runtime.objc.unwrap(url.path))); }
    return runtime.objc.unwrap(value);
}

function directory(runtime, path) {
    const { ns, objc, manager } = runtime;
    const url = ns.NSURL.fileURLWithPath(ns(path)).URLByResolvingSymlinksInPath;
    const resolved = String(objc.unwrap(url.path));
    const attributes = attributesAt(manager, ns, resolved);
    const identity = identityOf(objc, ns, attributes);
    if (kindOf(objc, ns, attributes) !== "NSFileTypeDirectory" || !identity) { throw comparisonError(path); }
    return { url, identity, device: attributeText(objc, attributes, ns.NSFileSystemNumber) };
}

function folderScope(runtime, path) {
    const found = directory(runtime, path);
    if (runtime.folders.has(found.identity)) { return runtime.folders.get(found.identity); }
    const sensitive = resource(runtime, found.url, runtime.ns.NSURLVolumeSupportsCaseSensitiveNamesKey);
    if (typeof sensitive !== "boolean") { throw comparisonError(path); }
    const scope = { ...found, path, sensitive, names: new Map(), buckets: new Map(), prototype: null };
    runtime.folders.set(found.identity, scope);
    return scope;
}

function createDirectory(runtime, path) {
    return Boolean(runtime.manager.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(runtime.ns(path), false, runtime.ns(), runtime.ref()));
}

function replacementNamespace(runtime, scope) {
    // Foundation's URL-prefixed selector is an instance method, not a constructor.
    // eslint-disable-next-line new-cap
    const url = runtime.manager.URLForDirectoryInDomainAppropriateForURLCreateError(runtime.ns.NSItemReplacementDirectory,
        runtime.ns.NSUserDomainMask, scope.url, true, runtime.ref());
    if (!url || url.isNil()) { return null; }
    const path = String(runtime.objc.unwrap(url.path));
    runtime.replacements.push(path);
    const attributes = attributesAt(runtime.manager, runtime.ns, path);
    if (kindOf(runtime.objc, runtime.ns, attributes) !== "NSFileTypeDirectory" ||
        attributeText(runtime.objc, attributes, runtime.ns.NSFileSystemNumber) !== scope.device) { return null; }
    const owner = runtime.ns.NSString.stringWithContentsOfFileEncodingError(runtime.ns(`${runtime.workspace}/owner.json`), runtime.ns.NSUTF8StringEncoding, runtime.ref());
    if (!owner || owner.isNil() || !owner.writeToFileAtomicallyEncodingError(runtime.ns(`${path}/owner.json`), true,
        runtime.ns.NSUTF8StringEncoding, runtime.ref())) { throw comparisonError(scope.path); }
    return path;
}

// Owned comparison directories and tokens provide real namespace lookups.
// Let the real namespace classify prospective names, including Unicode rules.
function prototypeGroup(runtime, scope, name) {
    if (!scope.prototype && !runtime.created) {
        if (!createDirectory(runtime, runtime.root)) { throw comparisonError(scope.path); }
        runtime.created = true;
    }
    if (!scope.prototype) {
        const path = `${runtime.root}/${runtime.folders.size}`;
        if (!createDirectory(runtime, path)) { throw comparisonError(scope.path); }
        scope.prototype = path;
    }
    const path = `${scope.prototype}/${name}`;
    const marker = `${path}/group`;
    if (createDirectory(runtime, path)) {
        const token = String(runtime.next);
        if (!runtime.ns(token).writeToFileAtomicallyEncodingError(runtime.ns(marker), true, runtime.ns.NSUTF8StringEncoding, runtime.ref())) {
            throw comparisonError(scope.path);
        }
        runtime.tokens.set(token, runtime.next); runtime.next += 1;
    }
    const stored = runtime.ns.NSString.stringWithContentsOfFileEncodingError(runtime.ns(marker), runtime.ns.NSUTF8StringEncoding, runtime.ref());
    const token = stored && !stored.isNil() ? String(runtime.objc.unwrap(stored)) : "";
    if (!runtime.tokens.has(token)) { throw comparisonError(scope.path); }
    return runtime.tokens.get(token);
}

// A broad search bucket is not an equivalence decision: native lookups below
// must confirm every nonliteral match on a volume outside the workspace.
function bucket(name) {
    return name.normalize("NFKD").toLowerCase().toUpperCase().toLowerCase().normalize("NFKD")
        .replace(/[\p{M}\p{Cf}\p{Default_Ignorable_Code_Point}]/gu, "");
}

function projection(source, name, otherName) {
    const stem = fileStem(source.originalName);
    const parts = fileStem(name).split("_");
    const replacements = fileStem(otherName).split("_");
    if (parts.length !== replacements.length) { return null; }
    let cursor = 0, projected = "";
    for (const [index, part] of parts.entries()) {
        const start = stem.indexOf(part, cursor);
        if (part.length === 0 || start < 0) { return null; }
        projected += stem.slice(cursor, start) + replacements[index];
        cursor = start + part.length;
    }
    return dirname(source.path) + projected + stem.slice(cursor) + source.originalName.slice(stem.length);
}

function reference(runtime, path) {
    const attributes = attributesAt(runtime.manager, runtime.ns, path);
    const identity = identityOf(runtime.objc, runtime.ns, attributes);
    if (!identity || kindOf(runtime.objc, runtime.ns, attributes) !== "NSFileTypeRegular") { return null; }
    const url = runtime.ns.NSURL.fileURLWithPath(runtime.ns(path));
    return { identity, url, device: attributeText(runtime.objc, attributes, runtime.ns.NSFileSystemNumber) };
}

function projectedMatch(runtime, scope, left, right) {
    const path = projection(left.source, left.name, right.name);
    if (path === null) { return null; }
    const original = reference(runtime, left.source.path);
    if (!original || original.device !== scope.device) { return null; }
    const alternate = reference(runtime, path);
    if (!alternate || original.identity !== alternate.identity) { return false; }
    if (scope.hardLinks === undefined) {
        scope.hardLinks = resource(runtime, scope.url, runtime.ns.NSURLVolumeSupportsHardLinksKey);
        if (typeof scope.hardLinks !== "boolean") { throw comparisonError(scope.path); }
    }
    // Inodes suffice on link-free volumes. Otherwise distinguish actual
    // directory entries, so an unrelated hard link cannot prove name equality.
    return !scope.hardLinks || resource(runtime, original.url, runtime.ns.NSURLCanonicalPathKey) ===
        resource(runtime, alternate.url, runtime.ns.NSURLCanonicalPathKey);
}

function equivalent(runtime, scope, left, right) {
    if (left.name === right.name) { return true; }
    if (/^[\x20-\x7e]+$/u.test(left.name) && /^[\x20-\x7e]+$/u.test(right.name)) {
        return !scope.sensitive && left.name.toLowerCase() === right.name.toLowerCase();
    }
    // Lookup fallback requires persistent identifiers; older link-free
    // providers may synthesize different IDs for Unicode lookup spellings.
    if (scope.persistent === undefined) {
        scope.persistent = resource(runtime, scope.url, runtime.ns.NSURLVolumeSupportsPersistentIDsKey);
    }
    if (scope.hardLinks === undefined) {
        scope.hardLinks = resource(runtime, scope.url, runtime.ns.NSURLVolumeSupportsHardLinksKey);
    }
    if (scope.persistent !== true || scope.hardLinks !== true) { throw comparisonError(scope.path); }
    const forwards = projectedMatch(runtime, scope, left, right);
    if (forwards !== null) { return forwards; }
    const backwards = projectedMatch(runtime, scope, right, left);
    if (backwards === null) { throw comparisonError(scope.path); }
    return backwards;
}

function foreignGroup(runtime, scope, source, name) {
    const key = bucket(name);
    const candidates = scope.buckets.get(key) ?? [];
    const record = { source, name };
    const match = candidates.find((other) => equivalent(runtime, scope, record, other));
    if (match) { return match.group; }
    record.group = runtime.next; runtime.next += 1;
    candidates.push(record);
    scope.buckets.set(key, candidates);
    return record.group;
}

function group(runtime, source) {
    const scope = folderScope(runtime, source.folder);
    const name = outputNameForSeparate(source);
    if (scope.names.has(name)) { return scope.names.get(name); }
    if (scope.device !== runtime.device && scope.replacementTried !== true) {
        scope.replacementTried = true;
        scope.prototype = replacementNamespace(runtime, scope);
    }
    const key = scope.device === runtime.device || scope.prototype ? prototypeGroup(runtime, scope, name) : foreignGroup(runtime, scope, source, name);
    scope.names.set(name, key);
    return key;
}

function removePrototypes(runtime) {
    const paths = [...runtime.replacements, ...runtime.created ? [runtime.root] : []];
    const issues = [];
    for (const path of paths) {
        if (!runtime.manager.removeItemAtPathError(runtime.ns(path), runtime.ref())) {
            issues.push({ code: ISSUE.cleanup, stage: "cleanup", message: "Temporary output-name comparisons could not be removed.", diagnostic: { path } });
        }
    }
    if (issues.length > 0) {
        const error = new OperationError("Temporary output-name comparisons could not be removed.");
        error.issues = issues;
        throw error;
    }
}

function managedGroups(runtime, sources) {
    let failure = null, groups = [];
    try { groups = sources.map((source) => group(runtime, source)); }
    catch (error) { failure = error; }
    try { removePrototypes(runtime); }
    catch (error) {
        if (failure) {
            const issues = [...issuesOf(failure, "planning"), ...issuesOf(error, "cleanup")];
            failure = new OperationError("Output-name comparison failed.", { cause: failure });
            failure.issues = issues;
        } else { failure = error; }
    }
    if (failure) { throw failure; }
    return groups;
}

function workspaceDevice(runtime, path) {
    try { return directory(runtime, path).device; }
    catch (cause) {
        const error = new OperationError("The private working folder could not be inspected.", { cause });
        error.issues = issuesOf(cause, "planning").map((issue) => ({ ...issue, message: error.message,
            diagnostic: { ...issue.diagnostic, path, detail: issue.message } }));
        throw error;
    }
}

function nativeDestinationNames(objc, ns) {
    if (!objc || !ns) { return null; }
    objc.import("Foundation");
    const manager = ns.NSFileManager.defaultManager;
    return {
        groups(sources, workspace) {
            if (sources.length <= 1) { return sources.map((unused, index) => index); }
            const runtime = { objc, ns, manager, ref: globalThis.Ref, folders: new Map(), tokens: new Map(), next: 0, created: false, replacements: [], workspace, root: `${workspace}/output-names` };
            runtime.device = workspaceDevice(runtime, workspace);
            return managedGroups(runtime, sources);
        }
    };
}
module.exports = { nativeDestinationNames };
