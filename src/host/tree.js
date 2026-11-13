"use strict";
const { OperationError } = require("../core/errors.js");
const { attributesAt, identityOf, kindOf } = require("./native-file-attributes.js");

/*
 * What the filesystem says about a path, for walking a selected folder.
 *
 * Foundation rather than the shell. A directory listing has to come back as a
 * list, and the shell can only hand back text: a filename may contain a
 * newline, which the integration suite already exercises elsewhere, and no
 * separator survives that. Measured: contentsOfDirectoryAtPath returns
 * "two\nlines.png" intact, attributesOfItemAtPath reports a symbolic link
 * without following it, and NSURL package resource values tell a package from a folder.
 *
 * It is also the only way to ask about thousands of entries without paying
 * for a subprocess each time. A folder of three thousand photographs would be
 * three thousand invocations of /bin/test, which is minutes of shell for a
 * question Foundation answers in microseconds.
 *
 * The bridge is taken by parameter so this can be driven from a fake, and
 * returns null when unavailable. The composition root requires this capability
 * for every source, including directly selected files.
 */

const DIRECTORY = "NSFileTypeDirectory";
const REGULAR = "NSFileTypeRegular";
const SYMBOLIC_LINK = "NSFileTypeSymbolicLink";

/*
 * Which file this is, as the filesystem knows it: the volume it is on and its
 * number on that volume. Two spellings of one file give the same pair --
 * measured, for A.jpg against a.jpg on a case-insensitive volume, which is
 * how a Mac is formatted by default.
 *
 * It comes out of the attributes this walk already reads, so knowing it costs
 * nothing, and it is "" when there are no attributes to read -- which is the
 * same thing as there being no file.
 */
function kindFrom(attributes, packageFor, path) {
    if (!attributes) {
        return "missing";
    }

    if (attributes.NSFileType !== DIRECTORY) {
        if (attributes.NSFileType === REGULAR) { return "file"; }
        return attributes.NSFileType === SYMBOLIC_LINK ? "link" : "other";
    }

    return packageFor(path) ? "package" : "directory";
}

function packageAt({ objc, ns, ref }, path) {
    const url = ns.NSURL.fileURLWithPath(ns(path));
    const values = url.resourceValuesForKeysError(ns([ns.NSURLIsPackageKey]), ref());
    if (!values || values.isNil()) { throw new OperationError("The folder's package status could not be read."); }
    const value = objc.unwrap(values.objectForKey(ns.NSURLIsPackageKey));
    if (typeof value !== "boolean") { throw new OperationError("The folder's package status could not be read."); }
    return value;
}

function createTree(objc, ns, ref) {
    if (!objc || !ns || !ref) {
        return null;
    }

    try {
        objc.import("Foundation");
    } catch {
        return null;
    }

    const manager = ns.NSFileManager.defaultManager;
    const packageFor = (path) => packageAt({ objc, ns, ref }, path);

    return {
        // What the path is, and which file it is, from one question.
        inspect(path) {
            const attributes = attributesAt(manager, ns, path);
            const kind = kindOf(objc, ns, attributes);
            return {
                kind: kindFrom(kind ? { NSFileType: kind } : null, packageFor, path),
                identity: identityOf(objc, ns, attributes)
            };
        },

        // The names in a directory, or null when it cannot be read at all.
        entries(path) {
            return objc.deepUnwrap(
                manager.contentsOfDirectoryAtPathError(ns(path), ref())
            );
        },

        // So that a folder selected twice, or a folder and its parent, are
        // recognized as the same folder.
        standardize(path) {
            return objc.unwrap(ns(path).stringByStandardizingPath);
        }
    };
}

module.exports = { createTree, kindFrom };
