"use strict";

/*
 * A page background, as the one kind of thing it is.
 *
 * Four named colours used to be the whole domain: a value was looked up in a
 * table and anything else refused. They are presets now, and any opaque sRGB
 * colour is accepted -- which makes what a colour *is* worth saying once,
 * here, rather than in the settings and again in the form. There were two
 * spellings of it before this: the settings took `#RRGGBB` and nothing else,
 * while the swatch parser beside it required upper case, so a value one of
 * them accepted could be one the other silently made nothing of.
 *
 * Permissive at the edge and strict in what is kept. A leading # is optional,
 * either case is taken, surrounding space is ignored, and what comes out is
 * always uppercase #RRGGBB. Normalizing is idempotent, so a value that has
 * been through here once is unchanged by going through again -- which is what
 * lets the form and the headless path share it without either needing to know
 * whether the other ran first.
 *
 * Six digits, and only six. Three-digit shorthand is refused rather than
 * guessed at, because #FFF is as readily an unfinished #FFF000 as it is
 * white; eight digits are refused because the fourth pair is transparency,
 * and a page background has nothing behind it to be transparent against.
 *
 * A value that is not a string is refused too, rather than converted: a
 * headless configuration is JSON, and a bare number there is a mistake to be
 * reported, not a colour to be inferred.
 */

const HEX_COLOUR =
    /^#?(?<red>[\da-f]{2})(?<green>[\da-f]{2})(?<blue>[\da-f]{2})$/iu;
const HEX_RADIX = 16;

const COLOUR_ERROR = "Page background must be six hexadecimal digits, for " +
    "example #C7DAE8. The # is optional, and transparency is not supported.";

function groupsOf(value) {
    if (typeof value !== "string") {
        return null;
    }

    const match = HEX_COLOUR.exec(value.trim());

    return match ? match.groups : null;
}

function normalizeColour(value) {
    const groups = groupsOf(value);

    if (!groups) {
        throw new Error(COLOUR_ERROR);
    }

    return `#${groups.red}${groups.green}${groups.blue}`.toUpperCase();
}

function rgbOf(value) {
    const groups = groupsOf(value);

    if (!groups) {
        throw new Error(COLOUR_ERROR);
    }

    return {
        red: parseInt(groups.red, HEX_RADIX),
        green: parseInt(groups.green, HEX_RADIX),
        blue: parseInt(groups.blue, HEX_RADIX)
    };
}

module.exports = { COLOUR_ERROR, normalizeColour, rgbOf };
