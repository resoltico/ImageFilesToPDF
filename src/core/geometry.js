"use strict";

const {
    POINTS_PER_INCH,
    PAGE_DEFINITIONS
} = require("./limits.js");

/*
 * The page keeps its exact point dimensions at every DPI; only the pixel
 * canvas scales. That way the published PDF is always precisely A4 or Letter.
 */
function calculatePageGeometry(settings) {
    const definition = PAGE_DEFINITIONS[settings.paperSize];
    const portrait = settings.orientation !== "Landscape";
    const widthPoints = portrait
        ? definition.widthPoints
        : definition.heightPoints;
    const heightPoints = portrait
        ? definition.heightPoints
        : definition.widthPoints;

    return {
        widthPixels: Math.round(widthPoints / POINTS_PER_INCH * settings.dpi),
        heightPixels: Math.round(heightPoints / POINTS_PER_INCH * settings.dpi),
        widthPoints,
        heightPoints,
        dpi: settings.dpi
    };
}

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
