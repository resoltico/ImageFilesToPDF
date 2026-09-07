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
 * Two names for one thing is also what a Mac's own filesystem hands over. It
 * is case-insensitive as formatted, so /photos/A.jpg and /photos/a.jpg are
 * one photograph -- measured, the same volume and the same file number -- and
 * standardizing the spelling does not make them one selection. What the
 * filesystem says the file is does, and every root carries it.
 *
 * It is carried rather than used as the key. Keyed by it, the first spelling
 * of a file was the only one considered, and whether that spelling was one
 * this action could convert had not been asked yet: two hard links to one
 * photograph, one named .jpg and one named .backup, meant the .backup was
 * turned away and the .jpg vanished from the run without being converted or
 * reported. Which requests there are is settled here; which of them convert
 * the same file is settled where they are admitted.
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
 * What the path is and which file it is, as the tree that would walk it sees
 * them. Without a tree nothing is walked and nothing has to be told from a
 * package, so there is nothing to ask: such a folder is turned away by the
 * same rejection that turns away everything else this action cannot convert,
 * and a path is the only identity there is.
 */
function inspect(tree, path) {
    return tree ? tree.inspect(path) : { kind: null, identity: "" };
}

function reportUnresolved(item, rejected) {
    const unresolved = describeUnresolved(item);

    if (unresolved) {
        rejected.push(unresolved);
    }
}

/*
 * Standardized, so that /Trip, /Trip/ and /Trip/Berlin/.. are one request
 * rather than three. The same spelling twice is the same question twice, and
 * asking the tree is asking Foundation; two spellings are asked about
 * separately, which is how they turn out to be one file.
 */
function remember(found, tree, path) {
    const standardized = tree ? tree.standardize(path) : path;

    if (found.roots.has(standardized)) {
        return;
    }

    const entry = inspect(tree, standardized);

    found.roots.set(standardized, {
        path: standardized,
        kind: entry.kind,
        identity: entry.identity
    });
}

function resolve(tree, items, rejected) {
    const found = { roots: new Map() };

    for (const item of items) {
        const path = inputItemToPosixPath(item);

        if (path) {
            remember(found, tree, path);
        } else {
            reportUnresolved(item, rejected);
        }
    }

    return [...found.roots.values()];
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
