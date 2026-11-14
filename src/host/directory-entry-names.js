"use strict";
const { OperationError, IssueError, errorMessage } = require("../core/errors.js");
const { ISSUE, issuesOf } = require("../core/outcomes.js");
// SDK-checked Darwin64 dirent, shared by supported arm64 and x86_64 processes.
const BYTE_RADIX = 256;
const ERRNO_SYMBOL = "__error";
const NAME_OFFSET = 21;
const NAME_CAPACITY = 1024;
const RECORD_CAPACITY = 1048;
function bindDirectoryPair(objc, ns) {
    const signatures = [["opendir", ["void *", ["char *"]]], ["readdir", ["unsigned char *", ["void *"]]]];
    const found = signatures.map(([name, signature]) => {
        try { objc.bindFunction(`${name}$INODE64`, signature); return true; }
        catch (error) { if (error?.name === "Error" && error.message === "function not found") { return false; } throw error; }
    });
    if (found[0] !== found[1]) { throw new OperationError("The native directory stream ABI could not be established."); }
    // x86_64 uses the INODE64 pair. arm64 has only the unsuffixed 64-bit ABI;
    // use it only when both suffixed symbols are positively unavailable.
    if (!found[0]) { for (const [name, signature] of signatures) { objc.bindFunction(name, signature); } }
    return { open: ns[found[0] ? "opendir$INODE64" : "opendir"], read: ns[found[0] ? "readdir$INODE64" : "readdir"] };
}
function decodedEntry(pointer, ns, objc) {
    const recordLength = Number(pointer[16]) + Number(pointer[17]) * BYTE_RADIX;
    const nameLength = Number(pointer[18]) + Number(pointer[19]) * BYTE_RADIX;
    if (!Number.isInteger(recordLength) || !Number.isInteger(nameLength) || nameLength < 1 || nameLength >= NAME_CAPACITY || recordLength > RECORD_CAPACITY || recordLength < NAME_OFFSET + nameLength + 1) {
        throw new OperationError("A native directory entry has invalid lengths.");
    }
    if (Number(pointer[NAME_OFFSET + nameLength]) !== 0) { throw new OperationError("A native directory entry has no terminating NUL."); }
    for (let index = 0; index < nameLength; index += 1) {
        if (Number(pointer[NAME_OFFSET + index]) === 0) { throw new OperationError("A native directory entry contains an embedded NUL."); }
    }
    // readdir owns this pointer until its next call. Copy before decoding and
    // require the UTF-8 bytes to survive the Foundation string boundary exactly.
    const copied = ns.NSData.dataWithBytesLength(pointer, NAME_OFFSET + nameLength + 1);
    const bytes = copied.subdataWithRange(ns.NSMakeRange(NAME_OFFSET, nameLength));
    const text = ns.NSString.alloc.initWithDataEncoding(bytes, ns.NSUTF8StringEncoding);
    if (!text || text.isNil() || !text.dataUsingEncoding(ns.NSUTF8StringEncoding).isEqualToData(bytes)) { throw new OperationError("A native directory entry is not exact UTF-8 text."); }
    return String(objc.unwrap(text));
}
function directoryFailure(operation, code) {
    return new OperationError(`Directory entry names could not be read (${operation}, errno ${code}).`);
}
function collectEntries(stream, pair, runtime) {
    const { ns, ref, nil, objc } = runtime;
    const names = [];
    for (;;) {
        // EOF does not set errno. Clear it before the call and capture it before
        // any other native operation, so a read failure cannot look like EOF.
        ns[ERRNO_SYMBOL]()[0] = 0;
        const entry = pair.read(stream);
        const code = Number(ns[ERRNO_SYMBOL]()[0]);
        if (ref.equals(entry, nil)) {
            if (code !== 0) { throw directoryFailure("readdir", code); }
            return names;
        }
        const name = decodedEntry(entry, ns, objc);
        if (name !== "." && name !== "..") { names.push(name); }
    }
}
function readEntries(directory, pair, runtime) {
    const { ns, ref, nil } = runtime;
    const stream = pair.open(directory);
    if (ref.equals(stream, nil)) { throw directoryFailure("opendir", Number(ns[ERRNO_SYMBOL]()[0])); }
    let failed = false, primary = null, value = null;
    try { value = collectEntries(stream, pair, runtime); }
    catch (error) { failed = true; primary = error; }
    const cleanup = [];
    try {
        const status = ns.closedir(stream);
        const code = status === 0 ? 0 : Number(ns[ERRNO_SYMBOL]()[0]);
        if (status !== 0) { throw directoryFailure("closedir", code); }
    } catch (error) { cleanup.push(error); }
    if (cleanup.length) {
        const closeIssues = issuesOf(cleanup[0], "cleanup");
        const classifications = closeIssues.filter((issue) => [ISSUE.fault, ISSUE.canceled].includes(issue.code));
        const mandatory = closeIssues.map((issue) => ({ ...issue, code: ISSUE.cleanup, stage: "cleanup" }));
        throw new IssueError(failed ? errorMessage(primary) : "The native directory stream could not be closed.", {
            cause: failed ? primary : cleanup[0], stack: (failed ? primary : cleanup[0])?.stack,
            issues: [...failed ? issuesOf(primary, "publication") : [], ...classifications, ...mandatory]
        });
    }
    if (failed) { throw primary; }
    return value;
}
function nativeEntryNames(objc, ns, ref = globalThis.Ref) {
    if (!objc || !ns || !ref) { throw new OperationError("Native directory entry names require the Objective-C bridge."); }
    let pair = null;
    try {
        objc.import("Foundation");
        objc.bindFunction("closedir", ["int", ["void *"]]);
        objc.bindFunction(ERRNO_SYMBOL, ["int *", []]);
        pair = bindDirectoryPair(objc, ns);
    } catch (cause) {
        if (cause?.name === "Error" && ["function not found", "nothing found to import"].includes(cause.message)) {
            throw new OperationError("Native directory entry names are unavailable.", { cause });
        }
        throw cause;
    }
    const runtime = { objc, ns, ref, nil: ns.NSValue.valueWithPointer(null).pointerValue };
    return (directory) => readEntries(directory, pair, runtime);
}
module.exports = { nativeEntryNames };
