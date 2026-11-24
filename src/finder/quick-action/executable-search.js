"use strict";

const { SYSTEM_PATHS, SYSTEM_FRAGMENTS, searchDirectories } = require("../../core/executable-search.js");

function finderDirectories() {
    ObjC.import("Foundation");
    const manager = $.NSFileManager.defaultManager;
    function read(file) {
        const info = manager.attributesOfItemAtPathError(file, $());
        if (!info || info.isNil()) { return ""; }
        const kind = info.objectForKey($.NSFileType);
        if (ObjC.unwrap(kind) !== ObjC.unwrap($.NSFileTypeRegular)) { return ""; }
        const text = $.NSString.stringWithContentsOfFileEncodingError(file, $.NSUTF8StringEncoding, $());
        return ObjC.unwrap(text) ?? "";
    }
    const listed = manager.contentsOfDirectoryAtPathError(SYSTEM_FRAGMENTS, $());
    const names = listed && !listed.isNil() ? ObjC.deepUnwrap(listed) : [];
    const fragments = Object.fromEntries(names.map((name) => [name, read(`${SYSTEM_FRAGMENTS}/${name}`)]));
    return searchDirectories({ systemPaths: { defaults: read(SYSTEM_PATHS), fragments } });
}

module.exports = { finderDirectories };
