"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    selectionContext, selectionSummary, outputSummary,
    outputAlternatives, destinationSummary
} = require("../../../src/core/output-description.js");

test("selection context preserves provenance and deduplicates ordered destinations", () => {
    assert.deepEqual(selectionContext({ images: [] }), {
        count: 0, selectedFolders: 0, folders: [], rejected: []
    });
    const rejected = [{ path: "/a/bad", reason: "unreadable folder" }];

    assert.deepEqual(selectionContext({
        images: [{ folder: "/a/" }, { folder: "/b/" }, { folder: "/a/" }],
        selectedFolders: 2,
        rejected
    }), { count: 3, selectedFolders: 2, folders: ["/a/", "/b/"], rejected });
});

test("selection wording distinguishes direct choices, folder discoveries and unknown counts", () => {
    assert.equal(selectionSummary(), "Choose how to save your images as PDF files.");
    assert.equal(selectionSummary({}), selectionSummary());
    assert.equal(selectionSummary({ count: 1 }), "You have selected 1 image.");
    assert.equal(selectionSummary({ count: 2 }), "You have selected 2 images.");
    assert.equal(selectionSummary({ count: 1, selectedFolders: 1 }),
        "Found 1 image in your selection, including subfolders.");
    assert.equal(selectionSummary({ count: 231, selectedFolders: 2 }),
        "Found 231 images in your selection, including subfolders.");
});

test("page and file cardinalities are separate, including one image", () => {
    assert.equal(outputSummary("single", 1), "1 PDF with 1 page");
    assert.equal(outputSummary("single", 12), "1 PDF with 12 pages");
    assert.equal(outputSummary("separate", 1), "1 single-page PDF");
    assert.equal(outputSummary("separate", 12), "12 single-page PDFs");
    assert.equal(outputSummary("separate", 0), "0 single-page PDFs");
    assert.equal(outputAlternatives(),
        "Save one PDF with a page for each image, or a single-page PDF per image.");
    assert.equal(outputAlternatives(1),
        "Either option creates 1 PDF with 1 page; only the filename differs.");
    assert.equal(outputAlternatives(12),
        "For this selection: 1 PDF with 12 pages, or 12 single-page PDFs.");
});

test("save guidance follows the actual destination rules for each mode", () => {
    assert.equal(destinationSummary(), "");
    assert.equal(destinationSummary({}), "");
    for (const mode of ["single", "separate", "both"]) {
        assert.equal(destinationSummary({ folders: ["/a/"] }, mode), "Save to: /a/");
    }
    const context = { folders: ["/a/", "/b/"] };
    const separate = "Separate PDFs save in each folder you selected, or " +
        "beside each image you selected: 2 folders.";

    assert.equal(destinationSummary(context, "single"), "Save to: /a/");
    assert.equal(destinationSummary(context, "separate"), separate);
    assert.equal(destinationSummary(context), `One PDF saves to: /a/\n${separate}`);
});
