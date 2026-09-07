"use strict";

const { basename, dirname } = require("../core/paths.js");
const { sortImageRecords } = require("../core/ordering.js");
const { imagesInFolder } = require("./expand.js");
const { selectedItems } = require("./selection.js");
const { finderSelection } = require("./input.js");
const { rejectionReason } = require("./reasons.js");

/*
 * Which of the requested files this action will convert, and why it will not
 * convert the others.
 *
 * Separated from resolution because a rejection is a stated reason rather than
 * the absence of an entry in a list: a silent filter turned a GIF selected
 * alongside two photos into a report that nothing had failed. What was
 * selected, and whether two selections are the same thing, is selection.js.
 */

function record(path, folder) {
    // Where the PDF goes: the folder that was selected when this image was
    // found inside one, and the image's own folder when it was selected
    // itself. The PDF lands where the person pointed, not in whichever
    // subfolder happened to sort first.
    return { path, originalName: basename(path), folder };
}

function rejection(path, reason) {
    return { path, name: basename(path), reason };
}

function admitFolder(tree, path, outcome) {
    const found = imagesInFolder(tree, path, outcome.taken);

    // Reported as themselves: naming the folder or the file the walk could
    // not look at is what lets someone go and see why.
    for (const problem of found.problems) {
        outcome.rejected.push(rejection(problem.path, problem.reason));
    }

    if (found.reason) {
        outcome.rejected.push(rejection(path, found.reason));

        return;
    }

    for (const image of found.found) {
        outcome.images.push(record(image, `${path}/`));
    }
}

/*
 * A package is a folder to the shell -- an .app, a .photoslibrary -- and
 * walking into one wrote the PDFs inside the bundle. The tree tells them
 * apart, so the reason can say which it is.
 */
function reasonFor(app, root) {
    return root.kind === "package"
        ? "a package, not a folder of images"
        : rejectionReason(app, root.path);
}

/*
 * Selection order puts every folder first, so by the time an explicit request
 * is considered the walking is done and the ledger is complete.
 *
 * An explicit request is never dropped for sitting under a selected folder.
 * The walk passes over hidden entries, packages and links, so assuming it had
 * taken them removed the request from the run without a word: a photograph
 * whose name began with a dot simply did not appear, and a file that could
 * not be converted stopped saying so. Already in the ledger is the one case
 * that is neither a rejection nor a second copy -- it was converted, which is
 * what was asked.
 */
function admit(app, tree, root, outcome) {
    // A kind at all means there is a tree: it is the tree that answered.
    if (root.kind === "directory") {
        admitFolder(tree, root.path, outcome);

        return;
    }

    if (outcome.taken.has(root.path)) {
        return;
    }

    const reason = reasonFor(app, root);

    if (reason) {
        outcome.rejected.push(rejection(root.path, reason));
    } else {
        outcome.images.push(record(root.path, dirname(root.path)));
    }
}

/*
 * The tree is what makes a selected folder mean the images inside it. Without
 * one -- no ObjC bridge -- a folder is refused with a reason instead, and the
 * files that were selected directly are converted as they always were.
 */
function collectImageFiles(app, inputItems, tree = null) {
    const items = inputItems.length > 0 ? inputItems : finderSelection();
    const outcome = { images: [], rejected: [], taken: new Set() };

    for (const root of selectedItems(tree, items, outcome.rejected)) {
        admit(app, tree, root, outcome);
    }

    return {
        images: sortImageRecords(outcome.images),
        rejected: outcome.rejected
    };
}

module.exports = { collectImageFiles };
