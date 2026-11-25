"use strict";

/*
 * Numeric parsing and formatting shared across the planner.
 */

function positiveIntegerFrom(text) {
    const value = Number(text);

    // Zero is not positive, and it is also what an unreadable value becomes.
    return /^\d+$/u.test(String(text).trim()) && Number.isSafeInteger(value) ? value : 0;
}

function zeroPad(value, width) {
    let text = String(value);

    while (text.length < width) {
        text = `0${text}`;
    }

    return text;
}

module.exports = { positiveIntegerFrom, zeroPad };
