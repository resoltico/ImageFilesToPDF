"use strict";

/*
 * Numeric parsing and formatting shared across the planner.
 */

const DECIMAL_PLACES = 2;

function positiveIntegerFrom(text) {
    const value = Number(text);

    return /^\d+$/u.test(String(text).trim()) && Number.isSafeInteger(value) && value > 0
        ? value
        : 0;
}


/*
 * Two decimal places with insignificant trailing zeros removed, which is the
 * form pdfcpu expects for page dimensions.
 */
function fixed2(value) {
    return Number(value).toFixed(DECIMAL_PLACES).replace(/0+$/u, "").replace(/\.$/u, "");
}

function zeroPad(value, width) {
    let text = String(value);

    while (text.length < width) {
        text = `0${text}`;
    }

    return text;
}

module.exports = { positiveIntegerFrom, fixed2, zeroPad };
