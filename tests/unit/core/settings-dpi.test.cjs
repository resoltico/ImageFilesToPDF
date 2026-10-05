"use strict";

/*
 * The DPI ceiling, which is arithmetic rather than taste.
 *
 * A page rendered at N DPI is an image, and pdfcpu refuses images above 100
 * megapixels in its stateless configuration.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    PAGE_DEFINITIONS,
    PDFCPU_PIXEL_LIMIT,
    MINIMUM_DPI,
    MAXIMUM_DPI
} = require("../../../src/core/limits.js");

test("the DPI ceiling is the one pdfcpu will actually accept", () => {
    // A page rendered at N DPI is an image, and pdfcpu refuses images over
    // 100,000,000 pixels in stateless mode.
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
    // largest page. Measured against the real tool at 1017 and 1018.
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
    assert.equal(MAXIMUM_DPI, 1017, "A4 is the largest page currently offered");
    assert.ok(MAXIMUM_DPI > MINIMUM_DPI);
});
