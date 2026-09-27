"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    invitation, formSpec, defaultAnswers, BACKGROUND_NOTE
} = require("../../../src/core/form.js");

test("one selected image is acknowledged in a complete sentence", () => {
    assert.equal(formSpec(defaultAnswers(), [], { count: 1 }).detail, [
        "You have selected 1 image.",
        "Each image gets its own page, centred without cropping. " +
            "The original files are not changed.",
        "Either option creates 1 PDF with 1 page; only the filename differs.",
        "Pages follow the full path, with 2 before 10, not the order you clicked.",
        BACKGROUND_NOTE
    ].join("\n"));
});

test("folder discoveries and destination are explained before creation", () => {
    const context = { count: 231, selectedFolders: 1, folders: ["/Selected/"] };
    const { detail } = formSpec(defaultAnswers(), [], context);

    assert.match(detail, /^Found 231 images in your selection, including subfolders\./u);
    assert.match(detail, /1 PDF with 231 pages, or 231 single-page PDFs/u);
    assert.match(detail, /Save to: \/Selected\//u);
    assert.ok(detail.endsWith(BACKGROUND_NOTE));
});

test("validation precedes but never replaces the selection and output contract", () => {
    const context = { count: 2 };
    const problems = [{ key: "dpi", message: "DPI: not a number" }];

    assert.equal(formSpec(defaultAnswers(), problems, context).detail,
        `DPI: not a number\n${invitation(context)}`);
});

test("changing grouping cannot leave a stale count preview", () => {
    const answers = defaultAnswers();
    const first = formSpec(answers, [], { count: 3 });
    const second = formSpec({
        ...answers, mode: "Separate PDFs — one page per image"
    }, [], { count: 3 });

    assert.equal(first.detail, second.detail);
    assert.notEqual(first.rows[0].value, second.rows[0].value);
    assert.match(first.detail, /1 PDF with 3 pages, or 3 single-page PDFs/u);
});

test("an unknown count is not invented, but the page layout remains explicit", () => {
    const detail = invitation();

    assert.match(detail, /^Choose how to save your images as PDF files\./u);
    assert.match(detail, /Each image gets its own page/u);
    assert.match(detail, /single-page PDF per image/u);
    assert.ok(!detail.includes("0 images"));
});
