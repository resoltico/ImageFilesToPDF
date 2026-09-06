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

module.exports = { calculatePageGeometry };
