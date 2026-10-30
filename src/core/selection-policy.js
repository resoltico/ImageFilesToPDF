"use strict";
const { isSupportedImage, supportedFormatList } = require("./paths.js");

function selectionReason(kind, path, regular) {
    if (kind === "package") { return "This is a package, not a folder of images."; }
    if (kind === "other") { return "This is a link; select the file it points to."; }
    if (kind === "directory") { return "This is a folder; select the images inside it."; }
    if (!isSupportedImage(path)) { return `This file is not a supported format; use ${supportedFormatList()}.`; }
    return regular ? "" : "This file cannot be read; check that it still exists and that you have access.";
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
