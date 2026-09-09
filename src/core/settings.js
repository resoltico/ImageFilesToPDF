"use strict";

const { normalizeColour, rgbOf } = require("./colour.js");
const { parseInteger } = require("./numbers.js");
const {
    PAGE_DEFINITIONS,
    MINIMUM_DPI,
    MAXIMUM_DPI,
    MINIMUM_QUALITY,
    MAXIMUM_QUALITY
} = require("./limits.js");

/*
 * What a setting means, and validation of whatever arrives from the form,
 * the dialogs or a headless configuration file. What the tools will accept
 * is limits.js.
 */

/*
 * The form and the dialogs offer "single" and "separate", which is what the
 * pipeline stores. The two older spellings are still taken because a headless
 * configuration written against an earlier release uses them, and a file that
 * worked yesterday has to work today.
 */
const MODE_MAP = {
    single: "single",
    separate: "separate",
    "Single PDF": "single",
    "Separate PDFs": "separate"
};

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
 * What vips is given for --background: the three components, always.
 *
 * It used to be one number for a grey and three for a colour, which is what
 * the table of four backgrounds held while there were only four. The reason
 * was that a one-band image could reach the flatten and take a single value
 * across its one band. It cannot. The resize stage converts to sRGB before
 * anything is flattened onto it, and measured, --export-profile=srgb turns a
 * one-band source into three bands and a two-band one into four. vips
 * broadcasts a single value across every band in any case, so the two forms
 * were the same instruction written two ways, and one of them is enough.
 *
 * Derived rather than tabulated, now that any colour is allowed: a table
 * would have to hold an entry for a value the user typed a moment ago.
 */
function backgroundVector(background) {
    const { red, green, blue } = rgbOf(background);

    return [red, green, blue].join(",");
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

module.exports = { isSeparateMode, backgroundVector, normalizeSettings };
