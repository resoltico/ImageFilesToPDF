"use strict";

const { plural } = require("./numbers.js");

/*
 * What will be created, said before anything is.
 *
 * Every sentence here describes the output in pages as well as files, because
 * "one PDF with all images" was read as a collage: the mode groups pages into
 * files and never changes how an image sits on its page.
 */

/*
 * Input facts carried from admission, never inferred from a path's spelling:
 * whether folders were selected decides whether the images were chosen or
 * found, and the folders the images belong to decide where PDFs go.
 */
function selectionContext(selection) {
    return {
        count: selection.images.length,
        selectedFolders: selection.selectedFolders ?? 0,
        folders: [...new Set(selection.images.map((image) => image.folder))],
        rejected: selection.rejected ?? []
    };
}

/*
 * Candidates for conversion, not a promise: an image counted here can still
 * turn out to be damaged.
 */
function selectionSummary({ count = 0, selectedFolders = 0 } = {}) {
    if (count === 0) {
        return "Choose how to save your images as PDF files.";
    }

    return selectedFolders > 0
        ? `Found ${plural(count, "image")} in your selection, including subfolders.`
        : `You have selected ${plural(count, "image")}.`;
}

function outputSummary(mode, count) {
    return mode === "single"
        ? `1 PDF with ${plural(count, "page")}`
        : plural(count, "single-page PDF");
}

/*
 * Both outcomes at once, because the form cannot follow its own popup: a line
 * computed from the mode that was showing would be false after the change.
 * With one image the two agree on the result and differ only in the name, and
 * the choice is kept because the name is a real difference.
 */
function outputAlternatives(count = 0) {
    if (count === 0) {
        return "Save one PDF with a page for each image, or a single-page PDF per image.";
    }

    if (count === 1) {
        return "Either option creates 1 PDF with 1 page; only the filename differs.";
    }

    return `For this selection: ${outputSummary("single", count)}, or ` +
        `${outputSummary("separate", count)}.`;
}

const PAGE_LAYOUT_NOTE = "Each image gets its own page, centred without " +
    "cropping. The original files are not changed.";
const ORDER_NOTE = "Pages follow the full path, with 2 before 10, not the " +
    "order you clicked.";

/*
 * A combined PDF goes to the first image's folder, in path order. Separate
 * PDFs follow their sources: into the folder that was selected when an image
 * was found inside one, beside the image when it was selected itself.
 */
function destinationSummary({ folders = [] } = {}, mode = "both") {
    if (folders.length === 0) {
        return "";
    }

    if (folders.length === 1 || mode === "single") {
        return `Save to: ${folders[0]}`;
    }

    const separate = "Separate PDFs save in each folder you selected, or " +
        `beside each image you selected: ${plural(folders.length, "folder")}.`;

    return mode === "separate"
        ? separate
        : `One PDF saves to: ${folders[0]}\n${separate}`;
}

module.exports = {
    selectionContext,
    selectionSummary,
    outputSummary,
    outputAlternatives,
    destinationSummary,
    PAGE_LAYOUT_NOTE,
    ORDER_NOTE
};
