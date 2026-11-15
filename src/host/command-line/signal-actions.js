"use strict";
const { OperationError } = require("../../core/errors.js");
// Measured 64-bit Darwin sigaction: pointer8, mask4, flags4. Keep every byte.
const SIGACTION_BYTES = 16;
const POINTER_BYTES = 8;

function nativeSignalActions(objc = globalThis.ObjC, ns = globalThis.$, ref = globalThis.Ref) {
    if (!objc || !ns || !ref) { throw new OperationError("Native signal actions require the Objective-C bridge."); }
    try {
        objc.import("Foundation"); objc.import("signal");
        for (const [name, signature] of [
            ["malloc", ["void *", ["unsigned long"]]], ["free", ["void", ["void *"]]],
            ["sigaction", ["int", ["int", "void *", "void *"]]],
            ["memcmp", ["int", ["void *", "void *", "unsigned long"]]]
        ]) { objc.bindFunction(name, signature); }
    } catch (cause) {
        if (cause instanceof TypeError || cause instanceof ReferenceError) { throw cause; }
        throw new OperationError("Native signal actions are unavailable.", { cause });
    }
    const nil = ns.NSValue.valueWithPointer(null).pointerValue;
    const ignoredHandler = ref("unsigned long"); ignoredHandler[0] = 1;
    return {
        allocate: () => { const snapshot = ns.malloc(SIGACTION_BYTES); return ref.equals(snapshot, nil) ? null : snapshot; },
        free: (snapshot) => ns.free(snapshot),
        read: (number, snapshot) => ns.sigaction(number, null, snapshot),
        restore: (number, snapshot) => ns.sigaction(number, snapshot, null),
        ignore(number) {
            const check = ns.malloc(SIGACTION_BYTES);
            if (ref.equals(check, nil)) { return -1; }
            try {
                ns.signal(number, 1);
                return ns.sigaction(number, null, check) === 0 ? ns.memcmp(check, ignoredHandler, POINTER_BYTES) : -1;
            } finally { ns.free(check); }
        }
    };
}
module.exports = { nativeSignalActions };
