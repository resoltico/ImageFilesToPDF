"use strict";
const { OperationError } = require("../core/errors.js");

const { errorMessage } = require("../core/errors.js");

/*
 * Orientations 5 to 8 are the ones that involve a quarter turn, either way and
 * with or without a mirror, and a quarter turn exchanges the sides. One to
 * four leave the sides as they are.
 */
const UPRIGHT = 1;
const FIRST_TURNED = 5;
const LAST_TURNED = 8;

function exchangesSides(orientation) {
    return orientation >= FIRST_TURNED && orientation <= LAST_TURNED;
}

/*
 * No orientation at all means upright, and vipsheader distinguishes the two
 * cases precisely: it names the field it could not find, so an image that
 * loaded and carries no tag is told apart from an image that would not load.
 * A JPEG written without metadata has no orientation field -- this action
 * writes such files itself -- and most PNGs have none either.
 *
 * Every other failure is reported rather than taken as upright. A turned
 * photograph laid out unturned reaches the page at a quarter of its area,
 * and a wrong PDF that reports success is worse than a run that stops.
 */
const ORIENTATION_ABSENT = /field "orientation" not found/u;

function readField(app, vipsheaderPath, imagePath, field) {
    const { runArgv } = require("./shell.js");
    const { positiveIntegerFrom } = require("../core/numbers.js");
    const value = positiveIntegerFrom(runArgv(app, [vipsheaderPath, "-f", field, imagePath], `reading the image ${field}`));
    if (value === 0) { throw new OperationError(`vipsheader returned an invalid ${field}: invalid numeric metadata`); }
    return value;
}

function readOrientation(app, vipsheaderPath, imagePath) {
    try {
        const orientation = readField(app, vipsheaderPath, imagePath, "orientation");

        if (orientation > LAST_TURNED) {
            throw new OperationError(`vipsheader returned an invalid orientation: ${orientation}`);
        }

        return orientation;
    } catch (error) {
        if (ORIENTATION_ABSENT.test(errorMessage(error))) {
            return UPRIGHT;
        }

        throw error;
    }
}

function readImageSize(app, vipsheaderPath, imagePath) {
    const width = readField(app, vipsheaderPath, imagePath, "width");
    const height = readField(app, vipsheaderPath, imagePath, "height");

    return exchangesSides(readOrientation(app, vipsheaderPath, imagePath))
        ? { width: height, height: width }
        : { width, height };
}

module.exports = { readField, readImageSize };
