"use strict";
const { message } = require("../../core/messages.js");
const { OperationError } = require("../../core/errors.js");

const ENGINE_FILENAME = /^engine-.+\.cjs$/u;
const PRIVATE_MODE = 0o700;

function ownedType(ns, manager, path) {
    const facts = manager.attributesOfItemAtPathError(path, ns());
    if (!facts || facts.isNil()) { return ""; }
    const owner = Number(facts.objectForKey(ns.NSFileOwnerAccountID).unsignedIntValue);
    if (owner !== Number(ns.getuid())) { return ""; }
    return String(ObjC.unwrap(facts.objectForKey(ns.NSFileType)));
}

function sameBytes(ns, manager, file, expected) {
    if (ownedType(ns, manager, file) !== "NSFileTypeRegular") { return false; }
    const data = ns.NSData.dataWithContentsOfFile(file);
    return Boolean(data && !data.isNil() && data.isEqualToData(expected));
}

function cacheFolder(ns, manager, home) {
    const folder = `${home}/Library/Application Support/Image Files to PDF/Engine`;
    manager.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(folder, true,
        ns({ NSFilePosixPermissions: PRIVATE_MODE }), ns());
    if (ownedType(ns, manager, folder) !== "NSFileTypeDirectory") { throw new OperationError(message("engineCacheUnavailable")); }
    return folder;
}

function replaceBundle(ns, manager, file, expected) {
    const temp = `${file}.${String(ObjC.unwrap(ns.NSUUID.UUID.UUIDString))}.tmp`;
    if (!expected.writeToFileOptionsError(temp, ns.NSDataWritingWithoutOverwriting, ns())) {
        throw new OperationError(message("engineCacheWriteFailed"));
    }
    try {
        if (!sameBytes(ns, manager, temp, expected) || Number(ns.rename(temp, file)) !== 0) {
            throw new OperationError(message("engineCacheWriteFailed"));
        }
    } finally {
        if (ownedType(ns, manager, temp) === "NSFileTypeRegular") { manager.removeItemAtPathError(temp, ns()); }
    }
}

function cleanOldEngines(ns, manager, folder, keep) {
    const listing = manager.contentsOfDirectoryAtPathError(folder, ns());
    if (!listing || listing.isNil()) { return; }
    for (const name of ObjC.deepUnwrap(listing)) {
        const path = `${folder}/${name}`;
        if (name !== keep && ENGINE_FILENAME.test(name) && ownedType(ns, manager, path) === "NSFileTypeRegular") {
            manager.removeItemAtPathError(path, ns());
        }
    }
}

function materializeEngine(bundle, home) {
    ObjC.import("Foundation");
    ObjC.bindFunction("getuid", ["unsigned int", []]);
    ObjC.bindFunction("rename", ["int", ["char *", "char *"]]);
    const ns = $;
    const manager = ns.NSFileManager.defaultManager;
    const folder = cacheFolder(ns, manager, home);
    const { filename, source } = bundle;
    const file = `${folder}/${filename}`;
    const expected = ns(source).dataUsingEncoding(ns.NSUTF8StringEncoding);
    if (!sameBytes(ns, manager, file, expected)) { replaceBundle(ns, manager, file, expected); }
    cleanOldEngines(ns, manager, folder, filename);
    if (!sameBytes(ns, manager, file, expected)) { throw new OperationError(message("engineCacheUnverified")); }
    return file;
}

module.exports = { materializeEngine };
