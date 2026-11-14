"use strict";
const { OperationError } = require("../core/errors.js");
const { basename, dirname } = require("../core/paths.js");
const { attributesAt, attributeText, identityOf, kindOf } = require("./native-file-attributes.js");

const RENAME_EXCL = 4;
const POSIX = { 17: "exists", 18: "cross-device", 45: "unsupported", 78: "unsupported", 1: "denied", 13: "denied", 30: "denied" };

function classify(code, domain) {
    return domain === "NSPOSIXErrorDomain" ? POSIX[code] ?? "unknown" : "unknown";
}

// What a C call answered: created, or what errno says went wrong, read at once.
function posixOutcome(ns, status) {
    if (status === 0) { return { state: "created" }; }
    // __error is the native thread-local errno function, whose spelling is fixed.
    // eslint-disable-next-line no-underscore-dangle
    const code = Number(ns.__error()[0]);
    return { state: classify(code, "NSPOSIXErrorDomain"), diagnostic: { code, domain: "NSPOSIXErrorDomain", message: String(ns.strerror(code)) } };
}

function nativeFacts(objc, ns, manager, path) {
    const attributes = attributesAt(manager, ns, path);
    if (kindOf(objc, ns, attributes) !== "NSFileTypeRegular") { return { identity: "", size: -1 }; }
    const identity = identityOf(objc, ns, attributes);
    const size = Number(attributeText(objc, attributes, ns.NSFileSize));
    return identity && Number.isSafeInteger(size) && size >= 0 ? { identity, size } : { identity: "", size: -1 };
}

function sameArtifact(facts, expected) {
    return Boolean(expected.identity) && facts.identity === expected.identity && facts.size === expected.size;
}

function storedPath({ objc, ns, manager }, path, expected) {
    if (!sameArtifact(nativeFacts(objc, ns, manager, path), expected)) {
        throw new OperationError("The published PDF identity could not be confirmed before reading its name.");
    }
    const error = ns();
    const values = ns.NSURL.fileURLWithPath(ns(path)).resourceValuesForKeysError(ns([ns.NSURLCanonicalPathKey]), error);
    if (!values || values.isNil()) { throw new OperationError("The published PDF's stored filename could not be read."); }
    const value = values.objectForKey(ns.NSURLCanonicalPathKey);
    if (!value || value.isNil()) { throw new OperationError("The published PDF's stored filename is unavailable."); }
    const canonical = String(objc.unwrap(value));
    const actual = dirname(path) + basename(canonical);
    if (!sameArtifact(nativeFacts(objc, ns, manager, canonical), expected) || !sameArtifact(nativeFacts(objc, ns, manager, actual), expected)) {
        throw new OperationError("The published PDF identity changed while reading its stored filename.");
    }
    return actual;
}

function nativePublication(objc, ns) {
    if (!objc || !ns) { return null; }
    objc.import("Foundation");
    objc.import("stdio");
    objc.bindFunction("__error", ["int *", []]);
    objc.bindFunction("strerror", ["char *", ["int"]]);
    objc.bindFunction("link", ["int", ["char *", "char *"]]);
    const manager = ns.NSFileManager.defaultManager;
    return {
        facts: (path) => nativeFacts(objc, ns, manager, path),
        actualPath: (path, expected) => storedPath({ objc, ns, manager }, path, expected),
        // link(2) rather than NSFileManager: measured, linkItemAtPath writes
        // the name decomposed, so a photograph named "rīga.jpg" in NFC came
        // back as a copy whose name no longer matched its original's bytes.
        // The C call keeps the bytes it is given and fails with EEXIST alike.
        link: (from, to) => posixOutcome(ns, ns.link(from, to)),
        rename: (from, to) => posixOutcome(ns, ns.renamex_np(from, to, RENAME_EXCL))
    };
}
module.exports = { nativePublication, classify };
