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
 * converted it is reported, and admission.js sees to that.
 *
 * What cannot be passed over silently is what the walk could not look at. A
 * folder it could not read, and an entry it could not get the attributes of,
 * are both things that might have been photographs -- so a run that leaves
 * them out and reports success is a run that lost work quietly. A listing can
 * succeed while inspecting what it listed fails: a folder with read but not
 * execute permission does exactly that.
 *
 * Dot-prefixed entries, packages and links are passed over. A link is not
 * followed because following one is how a walk leaves the folder it was given
 * and how it finds the same file twice.
 */

const HIDDEN = ".";
const UNREADABLE = "could not be read";
const UNEXAMINABLE = "could not be examined";

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

/*
 * One entry that is not a folder: an image to take, something to report, or
 * something nobody asked for.
 */
function consider(path, kind, taken, outcome) {
    if (kind === "missing") {
        outcome.problems.push({ path, reason: UNEXAMINABLE });

        return;
    }

    if (kind !== "file" || !isSupportedImage(path)) {
        return;
    }

    if (taken.has(path)) {
        // Another selection already has it. Counted, because a folder whose
        // images are all already taken is not a folder to complain about.
        outcome.skipped += 1;

        return;
    }

    taken.add(path);
    outcome.found.push(path);
}

function walk(tree, folder, taken, outcome) {
    const names = tree.entries(folder);

    if (!names) {
        outcome.problems.push({ path: folder, reason: UNREADABLE });

        return false;
    }

    for (const path of childrenOf(tree, folder, names)) {
        const kind = tree.kind(path);

        if (kind === "directory") {
            walk(tree, path, taken, outcome);
        } else {
            consider(path, kind, taken, outcome);
        }
    }

    return true;
}

/*
 * Why there is nothing to take from this folder, or "" when there is. Nothing
 * new is not the same as nothing at all: what is in here may already be in
 * the run because a folder above it was selected too.
 */
function emptiness(outcome) {
    return outcome.found.length === 0 && outcome.skipped === 0
        ? "contains no supported images"
        : "";
}

/*
 * The images inside a selected folder, whatever the walk could not look at,
 * and why there are none to take. The taken set is shared across every folder
 * of one run, and the walk adds to it as it goes.
 */
function imagesInFolder(tree, folder, taken) {
    const outcome = { found: [], problems: [], skipped: 0 };

    if (!walk(tree, folder, taken, outcome)) {
        // The folder that was selected, which is reported as itself rather
        // than as something unreadable inside it.
        return { found: [], problems: [], reason: UNREADABLE };
    }

    return {
        found: outcome.found,
        problems: outcome.problems,
        reason: emptiness(outcome)
    };
}

module.exports = { imagesInFolder, isHidden };
