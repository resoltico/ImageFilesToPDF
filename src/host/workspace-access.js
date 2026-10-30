"use strict";
const { OperationError } = require("../core/errors.js");

/** Native workspace metadata is kept separate from shell/process orchestration. */
function workspaceAccess(objc, ns) {
    if (!objc || !ns) { return null; }
    objc.import("Foundation");
    const manager = ns.NSFileManager.defaultManager;
    function entries(path) {
        const names = manager.contentsOfDirectoryAtPathError(ns(path), ns());
        if (!names || names.isNil()) { throw new OperationError("Workspace entries could not be read."); }
        return objc.deepUnwrap(names).map(String);
    }
    function read(path) {
        const text = ns.NSString.stringWithContentsOfFileEncodingError(ns(path), ns.NSUTF8StringEncoding, ns());
        if (!text || text.isNil()) { throw new OperationError("Workspace metadata could not be read."); }
        return String(objc.unwrap(text));
    }
    function write(path, text) {
        if (!ns(text).writeToFileAtomicallyEncodingError(ns(path), true, ns.NSUTF8StringEncoding, ns())) {
            throw new OperationError("Workspace metadata could not be written.");
        }
        if (read(path) !== text) { throw new OperationError("Workspace metadata could not be confirmed."); }
    }
    function remove(path) {
        if (!manager.removeItemAtPathError(ns(path), ns())) { throw new OperationError("Workspace metadata could not be removed."); }
    }
    return { entries, read, write, remove,
        temporary: String(objc.unwrap(ns.NSTemporaryDirectory())).replace(/\/$/u, ""),
        pid: Number(ns.NSProcessInfo.processInfo.processIdentifier),
        downloads: `${String(objc.unwrap(ns.NSHomeDirectory()))}/Downloads/` };
}
module.exports = { workspaceAccess };
