"use strict";
const { POINTS_PER_INCH, PAGE_DEFINITIONS } = require("./limits.js");

function calculatePageGeometry(settings) {
    const definition = PAGE_DEFINITIONS[settings.paperSize];
    const portrait = settings.orientation !== "Landscape";
    return { widthPoints: portrait ? definition.widthPoints : definition.heightPoints,
        heightPoints: portrait ? definition.heightPoints : definition.widthPoints, resolutionLimit: settings.resolutionLimit };
}

/** Natural size is one source pixel per point, fitted without enlargement. */
function calculatePlacement(geometry, source) {
    const fit = Math.min(geometry.widthPoints / source.width, geometry.heightPoints / source.height);
    const scale = Math.min(1, fit);
    const widthPoints = source.width * scale;
    const heightPoints = source.height * scale;
    return { widthPoints, heightPoints, relativeScale: Math.min(1, 1 / fit),
        widthPixels: Math.max(1, Math.min(source.width, Math.floor(widthPoints / POINTS_PER_INCH * geometry.resolutionLimit))),
        heightPixels: Math.max(1, Math.min(source.height, Math.floor(heightPoints / POINTS_PER_INCH * geometry.resolutionLimit))) };
}

const RGB_BANDS = 3;

function canPassThrough(source, placement) {
    return source.loader === "jpegload" && source.bands === RGB_BANDS && !source.icc && source.orientation === 1 &&
        ["", "srgb"].includes(source.interpretation) && source.width <= placement.widthPixels && source.height <= placement.heightPixels;
}
module.exports = { calculatePlacement, calculatePageGeometry, canPassThrough };
