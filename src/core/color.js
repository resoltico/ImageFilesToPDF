"use strict";

const HEX_COLOR =
    /^#?(?<red>[\da-f]{2})(?<green>[\da-f]{2})(?<blue>[\da-f]{2})$/iu;
const HEX_RADIX = 16;

const COLOR_ERROR = "must be six hexadecimal digits, for example #C7DAE8. The # is optional, and transparency is not supported.";

function groupsOf(value) {
    if (typeof value !== "string") {
        return null;
    }

    const match = HEX_COLOR.exec(value.trim());

    return match ? match.groups : null;
}

function normalizeColor(value) {
    const groups = groupsOf(value);

    if (!groups) {
        throw new Error(COLOR_ERROR);
    }

    return `#${groups.red}${groups.green}${groups.blue}`.toUpperCase();
}

function rgbOf(value) {
    const groups = groupsOf(value);

    if (!groups) {
        throw new Error(COLOR_ERROR);
    }

    return {
        red: parseInt(groups.red, HEX_RADIX),
        green: parseInt(groups.green, HEX_RADIX),
        blue: parseInt(groups.blue, HEX_RADIX)
    };
}

module.exports = { COLOR_ERROR, normalizeColor, rgbOf };
