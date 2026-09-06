"use strict";

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

/*
 * Backgrounds are keyed by hex, so every value is the same kind of thing. The
 * vips vector is a single number for greys and a triple for colours, which is
 * what vips itself expects.
 */
const BACKGROUND_DEFINITIONS = {
    "#FFFFFF": { vipsVector: "255" },
    "#000000": { vipsVector: "0" },
    "#8E79E0": { vipsVector: "142,121,224" },
    "#204486": { vipsVector: "32,68,134" }
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

function backgroundDefinition(background) {
    return BACKGROUND_DEFINITIONS[
        assertChoice(background, BACKGROUND_DEFINITIONS, "background")
    ];
}

function normalizeSettings(settings) {
    const paperSize = assertChoice(
        settings.paperSize,
        PAGE_DEFINITIONS,
        "paper size"
    );
    const background = assertChoice(
        settings.background,
        BACKGROUND_DEFINITIONS,
        "background"
    );
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

module.exports = {
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
