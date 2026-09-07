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
 * What the tree says a selected path is, when that settles it.
 *
 * A package is a folder to the shell -- an .app, a .photoslibrary -- and
 * walking into one wrote the PDFs inside the bundle. A link is refused for
 * the same reason the walk passes over one: following it is how the run
 * leaves the folder it was given and how it converts the same photograph
 * twice. Asking the shell instead followed it -- test -f reports on the
 * target -- so a link and the file it points to were two images.
 */
const KIND_REASONS = {
    package: "a package, not a folder of images",
    other: "a link; select the file it points to"
};

function reasonFor(app, root) {
    return KIND_REASONS[root.kind] ?? rejectionReason(app, root.path);
}

/*
 * Selection order puts every folder first, so by the time an explicit request
 * is considered the walking is done and the ledger is complete.
 *
 * An explicit request is never dropped for sitting under a selected folder.
 * The walk passes over hidden entries, packages and links, so assuming it had
 * taken them removed the request from the run without a word: a photograph
 * whose name began with a dot simply did not appear, and a file that could
 * not be converted stopped saying so.
 *
 * Each request is answered on its own terms first, and only then against the
 * ledger. The other way round, what the ledger already held decided whether a
 * name was ever assessed -- so of two names for one photograph, whichever
 * arrived first settled what the other was told, and the same selection said
 * different things depending on the order it arrived in. Being in the ledger
 * already is the one case that is neither a rejection nor a second copy: it
 * was converted, which is what was asked.
 */
function admit(app, tree, root, outcome) {
    // A kind at all means there is a tree: it is the tree that answered.
    if (root.kind === "directory") {
        admitFolder(tree, root.path, outcome);

        return;
    }

    const reason = reasonFor(app, root);

    if (reason) {
        outcome.rejected.push(rejection(root.path, reason));

        return;
    }

    // Which file, not which spelling: a folder walked before this request may
    // have taken the same photograph under the name it is stored as.
    if (!outcome.taken.has(root.identity || root.path)) {
        outcome.taken.add(root.identity || root.path);
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
