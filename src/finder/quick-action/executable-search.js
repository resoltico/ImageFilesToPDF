"use strict";

const { SYSTEM_PATHS, SYSTEM_FRAGMENTS, searchDirectories } = require("../../core/executable-search.js");

function finderDirectories() {
    ObjC.import("Foundation");
    const manager = $.NSFileManager.defaultManager;
    // The text of a regular file, or null, which the search skips.
    function read(file) {
        const info = manager.attributesOfItemAtPathError(file, $());
        if (!info || info.isNil() || ObjC.unwrap(info.objectForKey($.NSFileType)) !== ObjC.unwrap($.NSFileTypeRegular)) { return null; }
        return ObjC.unwrap($.NSString.stringWithContentsOfFileEncodingError(file, $.NSUTF8StringEncoding, $())) ?? null;
    }
    const listed = manager.contentsOfDirectoryAtPathError(SYSTEM_FRAGMENTS, $());
    const fragments = listed && !listed.isNil()
        ? Object.fromEntries(ObjC.deepUnwrap(listed).map((name) => [name, read(`${SYSTEM_FRAGMENTS}/${name}`)]))
        : {};
    return searchDirectories({ systemPaths: { defaults: read(SYSTEM_PATHS), fragments } });
}

module.exports = { finderDirectories };
