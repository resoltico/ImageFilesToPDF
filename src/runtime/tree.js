"use strict";

/*
 * What the filesystem says about a path, for walking a selected folder.
 *
 * Foundation rather than the shell. A directory listing has to come back as a
 * list, and the shell can only hand back text: a filename may contain a
 * newline, which the integration suite already exercises elsewhere, and no
 * separator survives that. Measured: contentsOfDirectoryAtPath returns
 * "two\nlines.png" intact, attributesOfItemAtPath reports a symbolic link
 * without following it, and NSWorkspace tells a package from a folder.
 *
 * It is also the only way to ask about thousands of entries without paying
 * for a subprocess each time. A folder of three thousand photographs would be
 * three thousand invocations of /bin/test, which is minutes of shell for a
 * question Foundation answers in microseconds.
 *
 * The bridge is taken by parameter so this can be driven from a fake, and
 * returns null when there is none: the action still converts the files it is
 * given, and a selected folder is refused with a reason rather than expanded.
 */

const DIRECTORY = "NSFileTypeDirectory";
const REGULAR = "NSFileTypeRegular";

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
function identityFrom(attributes) {
    return attributes
        ? `${attributes.NSFileSystemNumber}:${attributes.NSFileSystemFileNumber}`
        : "";
}

function kindFrom(attributes, workspace, path, ns) {
    if (!attributes) {
        return "missing";
    }

    if (attributes.NSFileType !== DIRECTORY) {
        return attributes.NSFileType === REGULAR ? "file" : "other";
    }

    return workspace.isFilePackageAtPath(ns(path)) ? "package" : "directory";
}

function createTree(objc, ns, ref) {
    if (!objc || !ns || !ref) {
        return null;
    }

    try {
        objc.import("Foundation");
        objc.import("AppKit");
    } catch {
        return null;
    }

    const manager = ns.NSFileManager.defaultManager;
    const workspace = ns.NSWorkspace.sharedWorkspace;

    return {
        // What the path is, and which file it is, from one question.
        inspect(path) {
            const attributes = objc.deepUnwrap(
                manager.attributesOfItemAtPathError(ns(path), ref())
            );

            return {
                kind: kindFrom(attributes, workspace, path, ns),
                identity: identityFrom(attributes)
            };
        },

        // The names in a directory, or null when it cannot be read at all.
        entries(path) {
            return objc.deepUnwrap(
                manager.contentsOfDirectoryAtPathError(ns(path), ref())
            );
        },

        // So that a folder selected twice, or a folder and its parent, are
        // recognised as the same folder.
        standardize(path) {
            return objc.unwrap(ns(path).stringByStandardizingPath);
        }
    };
}

module.exports = { createTree, kindFrom, identityFrom };
