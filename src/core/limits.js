"use strict";

/* Paper dimensions are PostScript points. The conservative ppi ceiling keeps
 * a page-filling embedded image within pdfcpu's 100 megapixel default. */
const PAGE_DEFINITIONS = {
    A4: { widthPoints: 595.2756, heightPoints: 841.8898 },
    Letter: { widthPoints: 612, heightPoints: 792 }
};

const MINIMUM_RESOLUTION_LIMIT = 72;

const PDFCPU_PIXEL_LIMIT = 100000000;
const POINTS_PER_INCH = 72;

function squareInchesOf({ widthPoints, heightPoints }) {
    return (widthPoints / POINTS_PER_INCH) * (heightPoints / POINTS_PER_INCH);
}

function largestPageArea() {
    return Math.max(...Object.values(PAGE_DEFINITIONS).map(squareInchesOf));
}

const MAXIMUM_RESOLUTION_LIMIT = Math.floor(
    Math.sqrt(PDFCPU_PIXEL_LIMIT / largestPageArea())
);
const MINIMUM_QUALITY = 1;
const MAXIMUM_QUALITY = 100;

module.exports = {
    PAGE_DEFINITIONS,
    POINTS_PER_INCH,
    PDFCPU_PIXEL_LIMIT,
    MINIMUM_RESOLUTION_LIMIT,
    MAXIMUM_RESOLUTION_LIMIT,
    MINIMUM_QUALITY,
    MAXIMUM_QUALITY
};
