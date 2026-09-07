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

/*
 * How many bytes a string is once it is UTF-8, which is what a command line
 * is measured in. String length counts UTF-16 code units: an accented letter
 * is one unit and two bytes, and anything above the basic plane is two units
 * and four bytes. A budget named in bytes and spent in units is a budget
 * about nothing.
 */
// Where UTF-8 needs another byte: ASCII, then two, three and four.
const UTF8_WIDTHS = [
    { below: 0x80, bytes: 1 },
    { below: 0x800, bytes: 2 },
    { below: 0x10000, bytes: 3 }
];
const UTF8_WIDEST = 4;

function utf8Length(text) {
    let bytes = 0;

    for (const character of String(text)) {
        const code = character.codePointAt(0);
        const width = UTF8_WIDTHS.find((step) => code < step.below);

        bytes += width ? width.bytes : UTF8_WIDEST;
    }

    return bytes;
}

/*
 * As much of the text as fits in a byte budget, cut between characters.
 *
 * The filesystem measures a filename in bytes, and half a character is not a
 * character: cutting by UTF-16 units could leave one byte of a two-byte
 * letter behind and produce a name that is not text at all.
 */
function truncateToBytes(text, budget) {
    let bytes = 0;
    let kept = "";

    for (const character of String(text)) {
        bytes += utf8Length(character);

        if (bytes > budget) {
            return kept;
        }

        kept += character;
    }

    return kept;
}

module.exports = {
    utf8Length,
    truncateToBytes,
    parseInteger,
    fixed2,
    zeroPad,
    plural,
    formatDuration
};
