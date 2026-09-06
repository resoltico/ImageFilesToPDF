"use strict";

/*
 * The DPI ceiling, which is arithmetic rather than taste.
 *
 * A page rendered at N DPI is an image, and pdfcpu refuses images above 100
 * megapixels. The tool offered 1200 for months: A4 at 1200 DPI is 139.2 MP,
 * so every run at the advertised maximum failed.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    PAGE_DEFINITIONS,
    PDFCPU_PIXEL_LIMIT,
    MINIMUM_DPI,
    MAXIMUM_DPI
} = require("../../../src/core/settings.js");

test("the DPI ceiling is the one pdfcpu will actually accept", () => {
    // A page rendered at N DPI is an image, and pdfcpu refuses images over
    // 100 megapixels. Offering 1200 meant every run at the advertised maximum
    // failed with "image pixel count 139201551 exceeds limit 104857600".
    const POINTS_PER_INCH = 72;
    const pixelsAt = (dpi, page) =>
        Math.round((page.widthPoints / POINTS_PER_INCH) * dpi)
        * Math.round((page.heightPoints / POINTS_PER_INCH) * dpi);

    for (const [name, page] of Object.entries(PAGE_DEFINITIONS)) {
        assert.ok(
            pixelsAt(MAXIMUM_DPI, page) <= PDFCPU_PIXEL_LIMIT,
            `${name} at ${MAXIMUM_DPI} DPI is ${pixelsAt(MAXIMUM_DPI, page)} pixels`
        );
    }

    // And it is the true maximum, not a cautious number: one more breaks the
    // largest page. Measured against the real tool at 1041 and 1042.
    // By area in points: comparing pixel counts at 1 DPI rounds both pages to
    // single digits and picks the wrong one.
    const area = (page) => page.widthPoints * page.heightPoints;
    const largest = Object.values(PAGE_DEFINITIONS)
        .reduce((widest, page) => (area(page) > area(widest) ? page : widest));

    assert.ok(
        pixelsAt(MAXIMUM_DPI + 1, largest) > PDFCPU_PIXEL_LIMIT,
        "a higher ceiling is available and is not being offered"
    );
});

test("the ceiling follows the paper sizes rather than being written down", () => {
    // Adding a larger paper size must lower the maximum, not silently
    // reintroduce one the pipeline refuses.
    assert.equal(MAXIMUM_DPI, 1041, "A4 is the largest page currently offered");
    assert.ok(MAXIMUM_DPI > MINIMUM_DPI);
});
