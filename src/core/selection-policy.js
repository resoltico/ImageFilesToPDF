"use strict";
const { isSupportedImage, supportedFormatList } = require("./paths.js");

function selectionReason(kind, path, regular) {
    if (kind === "package") { return "a package, not a folder of images"; }
    if (kind === "other") { return "a link; select the file it points to"; }
    if (kind === "directory") { return "a folder; select the images inside it"; }
    if (!isSupportedImage(path)) { return `not a supported format (${supportedFormatList()})`; }
    return regular ? "" : "not a readable file";
}

function selectionRefusal(entry) {
    return { ...entry, code: "selection-refused", stage: "selection" };
}
function selectionContext(selection) {
    return {
        count: selection.images.length,
        selectedFolders: selection.selectedFolders ?? 0,
        folders: [...new Set(selection.images.map((image) => image.folder))],
        rejected: selection.rejected ?? []
    };
}

module.exports = { selectionReason, selectionRefusal, selectionContext };
