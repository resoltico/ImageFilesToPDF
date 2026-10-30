"use strict";
const { zeroPad } = require("./numbers.js");
const TIMESTAMP_FIELD_WIDTH = 2;
const YEAR_WIDTH = 4;
const TIMESTAMP_FORM = "YYYYMMDD_HHMMSS";
const TIMESTAMP_PATTERN = /^(?<year>\d{4})(?<month>\d{2})(?<day>\d{2})_(?<hour>\d{2})(?<minute>\d{2})(?<second>\d{2})$/u;

function makeTimestamp(date) {
    const pad = (value) => zeroPad(value, TIMESTAMP_FIELD_WIDTH);
    return [zeroPad(date.getFullYear(), YEAR_WIDTH), pad(date.getMonth() + 1), pad(date.getDate()), "_",
        pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds())].join("");
}

function isTimestamp(value) {
    if (typeof value !== "string") { return false; }
    const match = TIMESTAMP_PATTERN.exec(value);
    if (!match) { return false; }
    const { year, month, day, hour, minute, second } = match.groups;
    const date = new Date(0);
    date.setFullYear(Number(year), Number(month) - 1, Number(day));
    date.setHours(Number(hour), Number(minute), Number(second), 0);
    return makeTimestamp(date) === value;
}

function readTimestamp(value) {
    if (!isTimestamp(value)) { throw new Error(`The timestamp must be a real local date-time in ${TIMESTAMP_FORM} form.`); }
    return value;
}
module.exports = { TIMESTAMP_FORM, makeTimestamp, isTimestamp, readTimestamp };
