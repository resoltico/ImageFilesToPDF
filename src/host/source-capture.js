"use strict";
const { attributesAt, attributeText, identityOf, kindOf } = require("./native-file-attributes.js");
const { hostError } = require("./cancellation.js");
const { OperationError, isUserCancelled, errorMessage } = require("../core/errors.js");
const { issuesOf, ISSUE } = require("../core/outcomes.js");
const { captureIssue, changedSourceIssue } = require("../core/source-policy.js");

function sourceFacts(context, path) {
    const { manager, ns, objc } = context;
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

function captureFailure(path, issue, cause) {
    const failure = new OperationError(`${path}: ${issue.message}`, { cause });
    failure.issues = [issue];
    return failure;
}

function captureSource(context, path, destination) {
    const { manager, ns, objc } = context;
    try {
        const before = sourceFacts(context, path);
        const error = ns();
        if (!manager.copyItemAtPathToPathError(ns(path), ns(destination), error)) {
            throw new OperationError(String(objc.unwrap(error.localizedDescription)));
        }
        const after = sourceFacts(context, path);
        const captured = sourceFacts(context, destination);
        if (before.identity !== after.identity || before.version !== after.version || captured.size !== before.size) {
            throw captureFailure(path, changedSourceIssue(path));
        }
        return { path: destination, identity: before.identity, version: before.version };
    } catch (caught) {
        const error = hostError(caught);
        if (isUserCancelled(error) || error.issues || issuesOf(error, "capture")[0].code === ISSUE.fault) { throw error; }
        throw captureFailure(path, captureIssue(path, { message: errorMessage(error) }), error);
    }
}

function pngCount(context, path) {
    const { ns, objc } = context;
    const source = ns.CGImageSourceCreateWithURL(ns.NSURL.fileURLWithPath(path), null);
    if (!source || objc.castRefToObject(source).isNil()) { throw new OperationError("PNG image count is unavailable."); }
    try {
        const count = Number(ns.CGImageSourceGetCount(source));
        if (!Number.isInteger(count) || count < 1) { throw new OperationError("Invalid PNG image count."); }
        return count;
    } finally { ns.CFRelease(source); }
}

/** Mandatory native source operations. Captures are copies, never hard links. */
function sourceAccess(objc, ns) {
    if (!objc || !ns) { return null; }
    objc.import("Foundation");
    objc.import("ImageIO");
    objc.import("CoreFoundation");
    objc.bindFunction("CFRelease", ["void", ["void *"]]);
    const context = { objc, ns, manager: ns.NSFileManager.defaultManager };
    return {
        facts: (path) => sourceFacts(context, path),
        readable: (path) => Boolean(context.manager.isReadableFileAtPath(ns(path))),
        capture: (path, destination) => captureSource(context, path, destination),
        pngCount: (path) => pngCount(context, path)
    };
}
module.exports = { sourceAccess };
