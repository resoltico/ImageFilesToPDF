"use strict";

const { inputItemToPosixPath } = require("./input.js");
const { describeUnresolved } = require("./reasons.js");

/*
 * What the path is and which file it is, as the tree that would walk it sees
 * them. Without a tree nothing is walked and nothing has to be told from a
 * package, so there is nothing to ask: such a folder is turned away by the
 * same rejection that turns away everything else this action cannot convert,
 * and a path is the only identity there is.
 */
function inspect(tree, path) {
    return tree.inspect(path);
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
function remember(found, tree, path, rejected) {
    const standardized = tree.standardize(path);

    if (found.roots.has(standardized)) {
        return;
    }

    const entry = inspect(tree, standardized);
    if (path.endsWith("/") && !["directory", "package"].includes(entry.kind)) {
        rejected.push({ path, name: path, reason: "This is not a folder; the path ends with a slash." });
        return;
    }

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
            remember(found, tree, path, rejected);
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
