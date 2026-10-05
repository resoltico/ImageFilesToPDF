"use strict";

/*
 * What the tools and the paper will accept.
 *
 * Apart from what a setting means, because these are facts about pdfcpu and
 * about paper -- measured, or derived from a measurement -- while settings.js
 * is about reading an answer. Both front ends quote them back when a number
 * is out of range, so they have to be reachable without depending on
 * validation.
 *
 * Page sizes are defined in PostScript points, the unit PDF itself uses, so a
 * page is exactly A4 or exactly US Letter. Deriving points from rounded inch
 * dimensions instead leaves the published page a fraction of a point away from
 * the real paper size, and readers stop recognising it.
 *
 * A4 is 210 x 297 mm exactly: 210 / 25.4 * 72 = 595.2756 pt.
 */
const PAGE_DEFINITIONS = {
    A4: { widthPoints: 595.2756, heightPoints: 841.8898 },
    Letter: { widthPoints: 612, heightPoints: 792 }
};

const MINIMUM_DPI = 72;

/*
 * pdfcpu refuses to import an image above 100 megapixels, and a page rendered
 * at N DPI is exactly that: an image. The ceiling is therefore not a matter of
 * taste but of arithmetic, and it belongs to whichever paper size is largest.
 *
 * Stateless pdfcpu defaults to 100,000,000 pixels. With rounded canvas sizes,
 * A4 at 1017 DPI imports successfully (99,987,936 pixels); 1018 DPI is rejected
 * (100,187,551 pixels). The CI tool check verifies the backend default.
 *
 * Deriving the DPI ceiling from the largest paper size keeps the offered
 * settings within that backend limit.
 */
const PDFCPU_PIXEL_LIMIT = 100000000;
const POINTS_PER_INCH = 72;

function squareInchesOf({ widthPoints, heightPoints }) {
    return (widthPoints / POINTS_PER_INCH) * (heightPoints / POINTS_PER_INCH);
}

function largestPageArea() {
    return Math.max(...Object.values(PAGE_DEFINITIONS).map(squareInchesOf));
}

const MAXIMUM_DPI = Math.floor(
    Math.sqrt(PDFCPU_PIXEL_LIMIT / largestPageArea())
);
const MINIMUM_QUALITY = 1;
const MAXIMUM_QUALITY = 100;


module.exports = {
    PAGE_DEFINITIONS,
    POINTS_PER_INCH,
    PDFCPU_PIXEL_LIMIT,
    MINIMUM_DPI,
    MAXIMUM_DPI,
    MINIMUM_QUALITY,
    MAXIMUM_QUALITY
};
