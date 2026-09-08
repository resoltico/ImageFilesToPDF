"use strict";

const { normalizeColour, rgbOf } = require("./colour.js");
const { parseInteger } = require("./numbers.js");

/*
 * The user-selectable settings, and validation of whatever arrives from the
 * dialogs or from a headless configuration file.
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

const MODE_MAP = {
    "Single PDF": "single",
    "Separate PDFs": "separate",
    single: "single",
    separate: "separate"
};

const MINIMUM_DPI = 72;

/*
 * pdfcpu refuses to import an image above 100 megapixels, and a page rendered
 * at N DPI is exactly that: an image. The ceiling is therefore not a matter of
 * taste but of arithmetic, and it belongs to whichever paper size is largest.
 *
 * Measured before it was derived: A4 at 1200 DPI is 9924 x 14028 = 139.2 MP,
 * and every such run failed with "image pixel count 139201551 exceeds limit
 * 104857600". Testing either side of the computed bound then agreed with it
 * exactly — A4 succeeds at 1041 and fails at 1042, Letter succeeds at 1058
 * and fails at 1059.
 *
 * Derived rather than written down as 1041, so that adding a paper size
 * cannot quietly reintroduce a maximum the pipeline will not accept.
 */
const PDFCPU_PIXEL_LIMIT = 104857600;
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

function own(object, key) {
    return Object.hasOwn(object, key);
}

function assertChoice(value, choices, label) {
    const text = String(value);

    if (!own(choices, text)) {
        throw new Error(`Unsupported ${label}: ${text}`);
    }

    return text;
}

/*
 * What vips is given for --background: one number for a grey and three for a
 * colour, which is exactly what the table of four backgrounds held while
 * there were only four. vips broadcasts a single value across however many
 * bands an image has, and at the flatten stage an image can still be one band
 * and an alpha -- a greyscale photograph with transparency is two, and takes
 * the first number of a triple. Measured on both: "255" and "199,218,232" are
 * each accepted by a two-band and a four-band image.
 *
 * Derived rather than tabulated, now that any colour is allowed. A table
 * would have to be written out for a value the user has just typed.
 */
function vipsVectorOf({ red, green, blue }) {
    return red === green && green === blue
        ? String(red)
        : [red, green, blue].join(",");
}

function backgroundDefinition(background) {
    return { vipsVector: vipsVectorOf(rgbOf(background)) };
}

function normalizeSettings(settings) {
    const paperSize = assertChoice(
        settings.paperSize,
        PAGE_DEFINITIONS,
        "paper size"
    );
    const background = normalizeColour(settings.background);
    const orientation = String(settings.orientation);
    const modeKey = String(settings.mode);

    if (orientation !== "Portrait" && orientation !== "Landscape") {
        throw new Error(`Unsupported page orientation: ${orientation}`);
    }

    if (!own(MODE_MAP, modeKey)) {
        throw new Error(`Unsupported output mode: ${modeKey}`);
    }

    return {
        paperSize,
        orientation,
        dpi: parseInteger(settings.dpi, MINIMUM_DPI, MAXIMUM_DPI, "DPI"),
        quality: parseInteger(
            settings.quality,
            MINIMUM_QUALITY,
            MAXIMUM_QUALITY,
            "Quality"
        ),
        mode: MODE_MAP[modeKey],
        background
    };
}

/*
 * Asked in two places -- which routine makes the PDFs, and how many units of
 * work the run has -- and they must not be able to disagree about it.
 */
function isSeparateMode(settings) {
    return settings.mode === MODE_MAP["Separate PDFs"];
}

module.exports = {
    isSeparateMode,
    PAGE_DEFINITIONS,
    POINTS_PER_INCH,
    PDFCPU_PIXEL_LIMIT,
    MINIMUM_DPI,
    MAXIMUM_DPI,
    MINIMUM_QUALITY,
    MAXIMUM_QUALITY,
    backgroundDefinition,
    normalizeSettings
};
