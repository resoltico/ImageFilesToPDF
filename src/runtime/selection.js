"use strict";

const { inputItemToPosixPath } = require("./input.js");
const { describeUnresolved } = require("./reasons.js");

/*
 * What was actually selected, each thing once.
 *
 * Identity is settled here, for everything, before anything is admitted --
 * because two names for one thing used to be two things. A folder selected
 * alongside a photo inside it converted that photo twice, and selecting them
 * the other way round made the folder report that it held nothing to convert:
 * the answer depended on the order Finder happened to hand the selection over.
 *
 * What each selected path is was asked of the shell, too, which cannot tell a
 * package from a folder. An .app or a .photoslibrary answered "directory", so
 * the walk went inside the bundle and the PDFs were written in there.
 *
 * So every path is standardized and asked what it is through the same tree
 * that will do the walking. Nothing is dropped for where its name sits: a
 * folder covering a path is not the same as the walk taking it -- the walk
 * passes over hidden entries, packages and links -- and dropping an explicit
 * request on that assumption removed it from the run without a word. What
 * was taken is settled by the walk itself, in admission.js.
 *
 * The order is the answer to that: folders first and in path order, so an
 * ancestor is always walked before a folder inside it, and every explicit
 * request is considered after the walking is done.
 */

/*
 * What the path is, as the tree that would walk it sees it. Without a tree
 * nothing is walked and nothing has to be told from a package, so there is
 * nothing to ask: such a folder is turned away by the same rejection that
 * turns away everything else this action cannot convert.
 */
function kindOf(tree, path) {
    return tree ? tree.kind(path) : null;
}

function reportUnresolved(item, rejected) {
    const unresolved = describeUnresolved(item);

    if (unresolved) {
        rejected.push(unresolved);
    }
}

/*
 * Standardized, so that /Trip, /Trip/ and /Trip/Berlin/.. are one selection
 * rather than three.
 */
function remember(roots, tree, path) {
    const identity = tree ? tree.standardize(path) : path;

    if (!roots.has(identity)) {
        roots.set(identity, { path: identity, kind: kindOf(tree, identity) });
    }
}

function resolve(tree, items, rejected) {
    const roots = new Map();

    for (const item of items) {
        const path = inputItemToPosixPath(item);

        if (path) {
            remember(roots, tree, path);
        } else {
            reportUnresolved(item, rejected);
        }
    }

    return [...roots.values()];
}

function isFolder(root) {
    return root.kind === "directory";
}

/*
 * Path order, which puts an ancestor before anything inside it: a folder's
 * path is a proper prefix of every path under it, and a prefix sorts first.
 * So the images in an overlap belong to the outermost folder that was
 * selected, whichever order the selection arrived in. Identities are unique
 * by now, so there is no third case.
 */
function byPath(left, right) {
    return left.path < right.path ? -1 : 1;
}

function selectedItems(tree, items, rejected) {
    const roots = resolve(tree, items, rejected);

    return [
        ...roots.filter(isFolder).sort(byPath),
        ...roots.filter((root) => !isFolder(root))
    ];
}

module.exports = { selectedItems };
