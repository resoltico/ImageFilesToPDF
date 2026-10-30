"use strict";

const { selectionReason } = require("../core/selection-policy.js");
const { isRegularFile, isDirectory } = require("./asking.js");
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
    return selectionReason(isDirectory(app, path) ? "directory" : "file", path, isRegularFile(app, path));
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

const ANONYMOUS = "[object Object]";

function describeUnresolved(item) {
    const named = pathCandidates(item)
        .find((candidate) => candidate && candidate !== ANONYMOUS);

    return named
        ? {
            path: "",
            name: named,
            reason: /^[a-z][a-z\d+.-]*:\/\//iu.test(named) && !/^file:/iu.test(named)
                ? "remote URLs are not supported; download the file first" : "not an absolute path to a file"
        }
        : null;
}

module.exports = { rejectionReason, describeUnresolved };
