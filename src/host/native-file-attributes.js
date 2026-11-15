"use strict";

function attributesAt(manager, ns, path, error = ns()) {
    const attributes = manager.attributesOfItemAtPathError(ns(path), error);
    return attributes && !attributes.isNil() ? attributes : null;
}

const ATTRIBUTE_ERRORS = {
    NSCocoaErrorDomain: { 4: "missing", 260: "missing", 257: "unreadable" },
    NSPOSIXErrorDomain: { 2: "missing", 20: "missing", 1: "unreadable", 13: "unreadable" }
};

function attributeErrorKind(objc, error) {
    return error && !error.isNil() ? ATTRIBUTE_ERRORS[String(objc.unwrap(error.domain))]?.[Number(error.code)] ?? null : null;
}

/** Absence requires a positive filesystem error, not merely missing attributes. */
function attributeFailureKind(objc, ns, error) {
    const direct = attributeErrorKind(objc, error);
    if (direct) { return direct; }
    if (!error || error.isNil()) { return "unexaminable"; }
    return attributeErrorKind(objc, error.userInfo.objectForKey(ns.NSUnderlyingErrorKey)) ?? "unexaminable";
}

function attributeText(objc, attributes, key) {
    return String(objc.unwrap(attributes.objectForKey(key).stringValue));
}

/** Preserve 64-bit native identifiers as text; a JS number can lose file identity. */
function identityOf(objc, ns, attributes) {
    if (!attributes) { return ""; }
    const device = attributeText(objc, attributes, ns.NSFileSystemNumber);
    const file = attributeText(objc, attributes, ns.NSFileSystemFileNumber);
    return /^\d+$/u.test(device) && /^\d+$/u.test(file) ? `${device}:${file}` : "";
}

function kindOf(objc, ns, attributes) {
    return attributes ? objc.unwrap(attributes.objectForKey(ns.NSFileType)) : null;
}

module.exports = { attributesAt, attributeText, identityOf, kindOf, attributeFailureKind };
