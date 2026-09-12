"use strict";

const { zeroPad } = require("./numbers.js");

/*
 * The stamp that tells one run's output from another's, and what one may be.
 *
 * A run generates its own. A headless caller may supply one instead, and that
 * value goes straight into an output filename -- so it is a value with a
 * shape rather than a string, and it is read where it arrives rather than
 * trusted all the way to the filesystem. "/../../elsewhere/result" is a
 * perfectly good string and is not a timestamp; interpolated into
 * output_${timestamp}.pdf it is a PDF in another folder.
 *
 * The rules live beside the thing that produces them so the two cannot drift:
 * whatever makeTimestamp returns, readTimestamp accepts.
 */

const TIMESTAMP_FIELD_WIDTH = 2;

// Eight digits, an underscore, six digits. Exactly what makeTimestamp emits,
// anchored at both ends so nothing may be carried along beside it.
const TIMESTAMP_FORM = "YYYYMMDD_HHMMSS";
const TIMESTAMP_PATTERN = /^\d{8}_\d{6}$/u;

function makeTimestamp(date) {
    const pad = (value) => zeroPad(value, TIMESTAMP_FIELD_WIDTH);

    return [
        date.getFullYear(),
        pad(date.getMonth() + 1),
        pad(date.getDate()),
        "_",
        pad(date.getHours()),
        pad(date.getMinutes()),
        pad(date.getSeconds())
    ].join("");
}

function isTimestamp(value) {
    return TIMESTAMP_PATTERN.test(String(value));
}

/*
 * Refused rather than repaired. Sanitizing an unusable value into a usable one
 * would name the output something the caller did not ask for and say nothing
 * about it, which is worse than a run that will not start.
 */
function readTimestamp(value) {
    const text = String(value);

    if (!isTimestamp(text)) {
        throw new Error(
            `The timestamp must be ${TIMESTAMP_FORM}, for example ` +
            `${makeTimestamp(new Date())}. It names one file and cannot ` +
            `contain a path. Received: ${text}`
        );
    }

    return text;
}

module.exports = { TIMESTAMP_FORM, makeTimestamp, isTimestamp, readTimestamp };
