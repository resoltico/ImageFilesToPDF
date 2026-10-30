"use strict";
const { nativeDestinationNames } = require("../../src/host/destination-names.js");
const { fileStem, dirname } = require("../../src/core/paths.js");
function details(path) {
    ObjC.import("Foundation");
    const reference = globalThis.Ref;
    const attributes = $.NSFileManager.defaultManager.attributesOfItemAtPathError($(path), reference());
    if (!attributes || attributes.isNil()) { return { path, missing: true }; }
    const url = $.NSURL.fileURLWithPath(path);
    const values = url.resourceValuesForKeysError($([$.NSURLNameKey, $.NSURLCanonicalPathKey, $.NSURLFileResourceIdentifierKey]), reference());
    const value = (key) => {
        const result = values?.objectForKey(key);
        return result && !result.isNil() ? String(ObjC.unwrap(result.description)) : null;
    };
    return { path, inode: String(ObjC.unwrap(attributes.objectForKey($.NSFileSystemFileNumber).stringValue)),
        name: value($.NSURLNameKey), canonical: value($.NSURLCanonicalPathKey), identifier: value($.NSURLFileResourceIdentifierKey) };
}
function run(input) {
    const sources = JSON.parse(String(input[0]));
    if (input[2] === "details") {
        return JSON.stringify(sources.map((source, index) => ({ original: details(source.path),
            alternate: details(dirname(source.path) + fileStem(sources[1 - index].originalName) + source.originalName.slice(fileStem(source.originalName).length)) })));
    }
    return JSON.stringify(nativeDestinationNames(ObjC, $).groups(sources, String(input[1])));
}
module.exports = { run };
