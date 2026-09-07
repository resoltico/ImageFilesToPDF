"use strict";

const { isSupportedImage, supportedFormatList } = require("../core/paths.js");
const { isRegularFile, isDirectory } = require("./shell.js");
const { pathCandidates } = require("./input.js");

/*
 * Why something the user asked for will not be converted.
 *
 * A rejection is a stated reason rather than the absence of an entry in a
 * list: a silent filter turned a GIF selected alongside two photos into a
 * report that nothing had failed.
 */

/*
 * Why a resolved path is not something this action can convert, or "" when it
 * is. Kept apart from the filtering so that a rejection is a stated reason
 * rather than the absence of an entry in a list.
 */
function rejectionReason(app, path) {
    // Asked first, because a folder that happens to be called album.png would
    // otherwise be turned away for having the wrong extension, and a folder
    // called album for having no extension at all. Neither says what it is.
    if (isDirectory(app, path)) {
        return "a folder; select the images inside it";
    }

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
/*
 * What to say about an item that resolved to no path at all.
 *
 * Shortcuts appends its parameters object to the input of every Quick Action,
 * and that is host metadata: it has no identity of its own, and String() on it
 * says as much. Anything that did name itself and still did not resolve is
 * something the user asked for, and used to be dropped between the resolution
 * and the admission without appearing in either list.
 */
const ANONYMOUS = "[object Object]";

function describeUnresolved(item) {
    const named = pathCandidates(item)
        .find((candidate) => candidate && candidate !== ANONYMOUS);

    return named
        ? {
            path: "",
            name: named,
            reason: "not an absolute path to a file"
        }
        : null;
}

module.exports = { rejectionReason, describeUnresolved };
