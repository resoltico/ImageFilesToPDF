"use strict";

const { isSupportedImage } = require("../core/paths.js");

/*
 * A selected folder means "convert the images in here", not "convert
 * everything in here".
 *
 * One fixed policy, with nothing to configure. What is discovered inside a
 * folder is taken when it is a supported image and passed over otherwise --
 * silently, because nobody asked for the other files and a folder of
 * documents would otherwise report a rejection for every one of them. What
 * was selected by hand is different: it was asked for, so if it cannot be
 * converted it is reported.
 *
 * Dot-prefixed entries, packages and links are passed over. A link is not
 * followed because following one is how a walk leaves the folder it was given
 * and how it finds the same file twice.
 */

const HIDDEN = ".";

function isHidden(name) {
    return name.startsWith(HIDDEN);
}

/*
 * Depth is bounded by the length of a path, so the deepest a folder can nest
 * is far shallower than anything a call stack minds.
 */
function childrenOf(tree, folder, names) {
    return names
        .filter((name) => !isHidden(name))
        .map((name) => tree.standardize(`${folder}/${name}`));
}

function walk(tree, folder, found, taken) {
    const names = tree.entries(folder);

    if (!names) {
        return false;
    }

    for (const path of childrenOf(tree, folder, names)) {
        const kind = tree.kind(path);

        if (kind === "directory") {
            walk(tree, path, found, taken);
        } else if (kind === "file" && isSupportedImage(path) && !taken.has(path)) {
            found.push(path);
        }
    }

    return true;
}

/*
 * The images inside a selected folder, or why there are none to take.
 */
function imagesInFolder(tree, folder, taken) {
    const found = [];

    if (!walk(tree, folder, found, taken)) {
        return { reason: "could not be read" };
    }

    return found.length > 0
        ? { found }
        : { reason: "contains no supported images" };
}

module.exports = { imagesInFolder, isHidden };
