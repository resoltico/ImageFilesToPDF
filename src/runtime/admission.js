"use strict";

const {
    isSupportedImage,
    supportedFormatList,
    basename
} = require("../core/paths.js");
const { sortImageRecords } = require("../core/ordering.js");
const { isRegularFile } = require("./shell.js");
const { inputItemToPosixPath, finderSelection } = require("./input.js");

/*
 * Which of the requested files this action will convert, and why it will not
 * convert the others.
 *
 * Separated from resolution because a rejection is a stated reason rather than
 * the absence of an entry in a list: a silent filter turned a GIF selected
 * alongside two photos into a report that nothing had failed.
 */

/*
 * Why a resolved path is not something this action can convert, or "" when it
 * is. Kept apart from the filtering so that a rejection is a stated reason
 * rather than the absence of an entry in a list.
 */
function rejectionReason(app, path) {
    if (!isSupportedImage(path)) {
        return `not a supported format (${supportedFormatList()})`;
    }

    return isRegularFile(app, path) ? "" : "not a readable file";
}

/*
 * Both what will be converted and what was asked for and will not be.
 *
 * A silent filter is the problem here: selecting a GIF alongside two photos
 * produced a PDF of the photos and a report that nothing had failed, so the
 * count described the surviving subset rather than the request. An item that
 * resolves to no path at all is host metadata — Shortcuts appends its
 * parameters to every Quick Action input — and is not a rejection, because
 * the user never asked for it.
 */
function admit(app, path, images, rejected) {
    const reason = rejectionReason(app, path);

    if (reason) {
        rejected.push({ path, name: basename(path), reason });
    } else {
        images.push({ path, originalName: basename(path) });
    }
}

function collectImageFiles(app, inputItems) {
    const items = inputItems.length > 0 ? inputItems : finderSelection();
    const images = [];
    const rejected = [];
    const paths = items
        .map((item) => inputItemToPosixPath(item))
        .filter(Boolean);

    for (const path of paths) {
        admit(app, path, images, rejected);
    }

    return { images: sortImageRecords(images), rejected };
}

module.exports = { rejectionReason, collectImageFiles };
