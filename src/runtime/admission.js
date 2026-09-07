"use strict";

const { basename, dirname } = require("../core/paths.js");
const { sortImageRecords } = require("../core/ordering.js");
const { imagesInFolder } = require("./expand.js");
const { isDirectory } = require("./shell.js");
const { inputItemToPosixPath, finderSelection } = require("./input.js");
const { rejectionReason, describeUnresolved } = require("./reasons.js");

/*
 * Which of the requested files this action will convert, and why it will not
 * convert the others.
 *
 * Separated from resolution because a rejection is a stated reason rather than
 * the absence of an entry in a list: a silent filter turned a GIF selected
 * alongside two photos into a report that nothing had failed.
 */

function record(path, folder) {
    // Where the PDF goes: the folder that was selected when this image was
    // found inside one, and the image's own folder when it was selected
    // itself. The PDF lands where the person pointed, not in whichever
    // subfolder happened to sort first.
    return { path, originalName: basename(path), folder };
}

function admitFolder(tree, path, outcome) {
    const found = imagesInFolder(tree, path, new Set(
        outcome.images.map((image) => image.path)
    ));

    if (found.reason) {
        outcome.rejected.push({
            path,
            name: basename(path),
            reason: found.reason
        });

        return;
    }

    for (const image of found.found) {
        outcome.images.push(record(image, `${path}/`));
    }
}

function admit(app, tree, path, outcome) {
    if (tree && isDirectory(app, path)) {
        admitFolder(tree, path, outcome);

        return;
    }

    const reason = rejectionReason(app, path);

    if (reason) {
        outcome.rejected.push({ path, name: basename(path), reason });
    } else {
        outcome.images.push(record(path, dirname(path)));
    }
}

function consider(app, tree, item, outcome) {
    const path = inputItemToPosixPath(item);

    if (path) {
        admit(app, tree, path, outcome);

        return;
    }

    const unresolved = describeUnresolved(item);

    if (unresolved) {
        outcome.rejected.push(unresolved);
    }
}

/*
 * The tree is what makes a selected folder mean the images inside it. Without
 * one -- no ObjC bridge -- a folder is refused with a reason instead, and the
 * files that were selected directly are converted as they always were.
 */
function collectImageFiles(app, inputItems, tree = null) {
    const items = inputItems.length > 0 ? inputItems : finderSelection();
    const outcome = { images: [], rejected: [] };

    for (const item of items) {
        consider(app, tree, item, outcome);
    }

    return {
        images: sortImageRecords(outcome.images),
        rejected: outcome.rejected
    };
}

module.exports = { collectImageFiles };
