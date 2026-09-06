"use strict";

const {
    POINTS_PER_INCH,
    PAGE_DEFINITIONS,
    normalizeSettings
} = require("./settings.js");

/*
 * The page keeps its exact point dimensions at every DPI; only the pixel
 * canvas scales. That way the published PDF is always precisely A4 or Letter.
 */
function calculatePageGeometry(settings) {
    const normalized = normalizeSettings(settings);
    const definition = PAGE_DEFINITIONS[normalized.paperSize];
    const portrait = normalized.orientation !== "Landscape";
    const widthPoints = portrait
        ? definition.widthPoints
        : definition.heightPoints;
    const heightPoints = portrait
        ? definition.heightPoints
        : definition.widthPoints;

    return {
        widthPixels: Math.round(widthPoints / POINTS_PER_INCH * normalized.dpi),
        heightPixels: Math.round(heightPoints / POINTS_PER_INCH * normalized.dpi),
        widthPoints,
        heightPoints,
        dpi: normalized.dpi
    };
}

/*
 * Where the image sits on the page, and how many pixels that is.
 *
 * One source pixel is treated as one point, so an image has a natural size on
 * paper that does not depend on the resolution chosen for the raster. It is
 * scaled down to fit the page and never enlarged beyond that natural size.
 *
 * Deciding this from the pixel canvas instead — fitting the image into the
 * page measured in output pixels — makes the resolution setting move the
 * picture: the same photograph covered 102 mm at 300 DPI and 51 mm at 600,
 * because a higher resolution made the page a larger number of pixels while
 * the image stayed the same number.
 */
function calculatePlacement(geometry, source) {
    const scale = Math.min(
        1,
        geometry.widthPoints / source.width,
        geometry.heightPoints / source.height
    );
    const widthPoints = source.width * scale;
    const heightPoints = source.height * scale;
    const toPixels = (points) => Math.max(
        1,
        Math.round(points / POINTS_PER_INCH * geometry.dpi)
    );

    return {
        widthPoints,
        heightPoints,
        widthPixels: toPixels(widthPoints),
        heightPixels: toPixels(heightPoints)
    };
}

module.exports = { calculatePlacement, calculatePageGeometry };
