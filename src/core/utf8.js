"use strict";

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

module.exports = { utf8Length, truncateToBytes };
