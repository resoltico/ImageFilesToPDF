"use strict";

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
