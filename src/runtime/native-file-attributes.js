"use strict";

function attributesAt(manager, ns, path) {
    const attributes = manager.attributesOfItemAtPathError(ns(path), ns());
    return attributes && !attributes.isNil() ? attributes : null;
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

module.exports = { attributesAt, attributeText, identityOf, kindOf };
