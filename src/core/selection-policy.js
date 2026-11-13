"use strict";
const { basename } = require("./paths.js");
const { isSupportedImage, supportedFormatList } = require("./formats.js");

/* Receipt code for each selection refusal, and the sentence that explains it. */
const SELECTION_REASONS = Object.freeze({
    folder: "This is a folder; select the images inside it.",
    "unsupported-format": `This file is not a supported format; use ${supportedFormatList()}.`,
    "not-a-file": "This file cannot be read; check that it still exists and that you have access.",
    "not-a-path": "This is not an absolute path to a file.",
    "remote-url": "Remote URLs are not supported; download the file first.",
    "not-a-folder": "This is not a folder; the path ends with a slash.",
    package: "This is a package, not a folder of images.",
    link: "This is a link; select the file it points to.",
    "special-file": "This is not a regular file (a pipe, socket or device).",
    unreadable: "This item could not be read.",
    unexaminable: "This item could not be examined.",
    "empty-folder": "This folder contains no supported images."
});

const KIND_CODES = Object.freeze({ package: "package", link: "link", other: "special-file", directory: "folder" });

/* The refusal code for a selected path, or "" when it can be converted. */
function selectionReason(kind, path, regular) {
    if (Object.hasOwn(KIND_CODES, kind)) { return KIND_CODES[kind]; }
    if (!isSupportedImage(path)) { return "unsupported-format"; }
    return regular ? "" : "not-a-file";
}

function selectionRefusal(path, code, name = basename(path)) {
    if (!Object.hasOwn(SELECTION_REASONS, code)) { throw new Error(`Unknown selection refusal code: ${code}`); }
    return { path, name, reason: SELECTION_REASONS[code], code, stage: "selection" };
}
function selectionContext(selection) {
    return {
        count: selection.images.length,
        selectedFolders: selection.selectedFolders ?? 0,
        folders: [...new Set(selection.images.map((image) => image.folder))],
        rejected: selection.rejected ?? []
    };
}

module.exports = { SELECTION_REASONS, selectionReason, selectionRefusal, selectionContext };
