"use strict";

/*
 * Numeric parsing and formatting shared across the planner.
 */

const DECIMAL_PLACES = 2;
const MILLISECONDS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;

function parseInteger(value, minimum, maximum, label) {
    const numeric = Number(value);

    if (
        !isFinite(numeric) ||
        Math.floor(numeric) !== numeric ||
        numeric < minimum ||
        numeric > maximum
    ) {
        throw new Error(
            `${label} must be a whole number from ${minimum} to ${maximum}.`
        );
    }

    return numeric;
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

/*
 * "1 PDF" / "2 PDFs", rather than the "(s)" that stands in for it.
 */
function plural(count, singular, pluralForm) {
    return `${count} ${count === 1 ? singular : pluralForm ?? `${singular}s`}`;
}

function formatDuration(milliseconds) {
    const totalSeconds = Math.max(0, Math.round(Number(milliseconds) / MILLISECONDS_PER_SECOND));
    const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
    const seconds = totalSeconds % SECONDS_PER_MINUTE;

    if (minutes <= 0) {
        return `${seconds} second(s)`;
    }

    return `${minutes} minute(s), ${seconds} second(s)`;
}

module.exports = { parseInteger, fixed2, zeroPad, plural, formatDuration };
