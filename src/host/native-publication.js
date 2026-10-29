"use strict";
const { attributesAt, attributeText, identityOf, kindOf } = require("./native-file-attributes.js");

const RENAME_EXCL = 4;
const POSIX = { 17: "exists", 18: "cross-device", 45: "unsupported", 78: "unsupported", 1: "denied", 13: "denied", 30: "denied" };

function classify(code, domain) {
    if (domain === "NSPOSIXErrorDomain") { return POSIX[code] ?? "unknown"; }
    if (domain === "NSCocoaErrorDomain") {
        return { 516: "exists", 513: "denied", 642: "denied" }[code] ?? "unknown";
    }
    return "unknown";
}

function nativeFacts(objc, ns, manager, path) {
    const attributes = attributesAt(manager, ns, path);
    if (kindOf(objc, ns, attributes) !== "NSFileTypeRegular") { return { identity: "", size: -1 }; }
    const identity = identityOf(objc, ns, attributes);
    const size = Number(attributeText(objc, attributes, ns.NSFileSize));
    return identity && Number.isSafeInteger(size) && size >= 0 ? { identity, size } : { identity: "", size: -1 };
}

function nativePublication(objc, ns) {
    if (!objc || !ns) { return null; }
    objc.import("Foundation");
    objc.import("stdio");
    objc.bindFunction("__error", ["int *", []]);
    objc.bindFunction("strerror", ["char *", ["int"]]);
    const manager = ns.NSFileManager.defaultManager;
    return {
        facts: (path) => nativeFacts(objc, ns, manager, path),
        link(from, to) {
            const error = ns();
            if (manager.linkItemAtPathToPathError(ns(from), ns(to), error)) { return { state: "created" }; }
            const code = Number(error.code);
            const domain = String(objc.unwrap(error.domain));
            let state = classify(code, domain);
            const underlying = error.userInfo.objectForKey(ns.NSUnderlyingErrorKey);
            if (state === "unknown" && underlying && !underlying.isNil()) {
                state = classify(Number(underlying.code), String(objc.unwrap(underlying.domain)));
            }
            return { state, diagnostic: { code, domain,
                message: String(objc.unwrap(error.localizedDescription)) } };
        },
        rename(from, to) {
            const status = ns.renamex_np(from, to, RENAME_EXCL);
            // __error is the native thread-local errno function, whose spelling is fixed.
            // eslint-disable-next-line no-underscore-dangle
            const code = status === 0 ? 0 : Number(ns.__error()[0]);
            return status === 0 ? { state: "created" } : {
                state: classify(code, "NSPOSIXErrorDomain"), diagnostic: { code, domain: "NSPOSIXErrorDomain", message: String(ns.strerror(code)) }
            };
        }
    };
}
module.exports = { nativePublication, classify };
