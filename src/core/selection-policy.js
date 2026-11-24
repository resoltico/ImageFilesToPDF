"use strict";
const { basename } = require("./paths.js");
const { isSupportedImage, supportedFormatList } = require("./formats.js");

const { message } = require("./messages.js");

const SELECTION_REASONS = Object.freeze({
    folder: "selectionFolder",
    "unsupported-format": "selectionUnsupportedFormat",
    "not-a-file": "sourceUnavailable",
    "not-a-path": "selectionMissing",
    "remote-url": "selectionRemoteUrl",
    "not-a-folder": "selectionNotDirectory",
    package: "selectionPackage",
    link: "selectionLink",
    "special-file": "selectionSpecialFile",
    unreadable: "selectionUnreadable",
    unexaminable: "selectionUnexaminable",
    "empty-folder": "selectionEmptyFolder"
});

const KIND_CODES = Object.freeze({ package: "package", link: "link", other: "special-file", directory: "folder", missing: "not-a-path", unreadable: "unreadable", unexaminable: "unexaminable" });

/* The refusal code for a selected path, or "" when it can be converted. */
function selectionReason(kind, path, regular) {
    if (Object.hasOwn(KIND_CODES, kind)) { return KIND_CODES[kind]; }
    if (!isSupportedImage(path)) { return "unsupported-format"; }
    return regular ? "" : "not-a-file";
}

function selectionRefusal(path, code, name = basename(path)) {
    if (!Object.hasOwn(SELECTION_REASONS, code)) { throw new Error(`Unknown selection refusal code: ${code}`); }
    return { path, name, reason: message(SELECTION_REASONS[code], { formats: supportedFormatList() }), code, stage: "selection" };
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
