"use strict";

const {selectionContext}=require("../../../src/core/selection-policy.js");
const assert = require("node:assert/strict");
const test = require("node:test");
const {
    selectionSummary, outputSummary,
    outputAlternatives, destinationSummary
} = require("../../../src/finder/quick-action/output-description.js");

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
    assert.equal(outputSummary("combined", 1), "1 PDF with 1 page");
    assert.equal(outputSummary("combined", 12), "1 PDF with 12 pages");
    assert.equal(outputSummary("separate", 1), "1 single-page PDF");
    assert.equal(outputSummary("separate", 12), "12 single-page PDFs");
    assert.equal(outputSummary("separate", 0), "0 single-page PDFs");
    assert.equal(outputAlternatives(),
        "Save one PDF with a page for each image, or a single-page PDF per image.");
    assert.equal(outputAlternatives(1),
        "Either option creates the same PDF with 1 page, named after the image.");
    assert.equal(outputAlternatives(12),
        "For this selection: 1 PDF with 12 pages, or 12 single-page PDFs.");
});

test("save guidance follows the actual destination rules for each mode", () => {
    assert.equal(destinationSummary({}, "combined"), "");
    for (const mode of ["combined", "separate"]) {
        assert.equal(destinationSummary({ folders: ["/a/"] }, mode), "Save to: /a/");
    }
    const context = { folders: ["/a/", "/b/"] };
    const separate = "Separate PDFs save in each folder you selected, or " +
        "beside each image you selected: 2 folders.";

    assert.equal(destinationSummary(context, "combined"), "Save to: /a/");
    assert.equal(destinationSummary(context, "separate"), separate);
});

test("the form names where the PDFs go, by folder name, or the source folder when none is known", () => {
    const { formSummary } = require("../../../src/finder/quick-action/output-description.js");
    assert.equal(formSummary({ count: 2 }, "combined"), "2 images → 1 PDF with 2 pages, saved in the source folder");
    assert.equal(formSummary({ count: 1, folders: ["/Pictures/One"] }, "separate"), "1 image → 1 single-page PDF, saved in One/");
    assert.equal(formSummary({ count: 1, folders: ["/"] }, "combined"), "1 image → 1 PDF with 1 page, saved in /");
    assert.equal(formSummary({ count: 2, folders: ["/a/One", "/b/Two"] }, "separate"), "2 images → 2 single-page PDFs, saved in 2 folders");
});
