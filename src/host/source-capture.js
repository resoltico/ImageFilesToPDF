"use strict";
const { attributesAt, attributeText, identityOf, kindOf } = require("./native-file-attributes.js");
const { OperationError } = require("../core/errors.js");

/** Mandatory source operations. Every capture is a copy, never a hard link. */
function sourceAccess(objc, ns) {
    if (!objc || !ns) { return null; }
    objc.import("Foundation");
    objc.import("ImageIO");
    objc.import("CoreFoundation");
    objc.bindFunction("CFRelease", ["void", ["void *"]]);
    const manager = ns.NSFileManager.defaultManager;
    function facts(path) {
        const attributes = attributesAt(manager, ns, path);
        if (!attributes) { throw new OperationError("Source attributes are unavailable."); }
        const identity = identityOf(objc, ns, attributes);
        const size = attributeText(objc, attributes, ns.NSFileSize);
        const version = [Number(attributes.objectForKey(ns.NSFileModificationDate).timeIntervalSince1970),
            Number(attributes.objectForKey(ns.NSFileCreationDate).timeIntervalSince1970)];
        if (kindOf(objc, ns, attributes) !== "NSFileTypeRegular" || !identity || !/^\d+$/u.test(size) || version.some((value) => !Number.isFinite(value))) {
            throw new OperationError("Source must be an identifiable regular non-link file with readable version facts.");
        }
        return { identity, size, version: [...version, size].join(":") };
    }
    return {
        capture(path, destination) {
            const before = facts(path);
            const error = ns();
            if (!manager.copyItemAtPathToPathError(ns(path), ns(destination), error)) {
                throw new OperationError(`Source capture failed: ${objc.unwrap(error.localizedDescription)}`);
            }
            const after = facts(path);
            const captured = facts(destination);
            if (before.identity !== after.identity || before.version !== after.version || captured.size !== before.size) {
                throw new OperationError("Source changed during capture; try again when it is stable.");
            }
            return { path: destination, identity: before.identity, version: before.version };
        },
        pngCount(path) {
            const source = ns.CGImageSourceCreateWithURL(ns.NSURL.fileURLWithPath(path), null);
            if (!source || objc.castRefToObject(source).isNil()) { throw new OperationError("PNG image count is unavailable."); }
            try {
                const count = Number(ns.CGImageSourceGetCount(source));
                if (!Number.isInteger(count) || count < 1) { throw new OperationError("Invalid PNG image count."); }
                return count;
            } finally {
                ns.CFRelease(source);
            }
        }
    };
}
module.exports = { sourceAccess };
