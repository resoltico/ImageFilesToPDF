"use strict";

/*
 * The stamp that tells one run's output from another's.
 *
 * A run generates its own and a headless caller may supply one, and that
 * value goes straight into an output filename. "/../../elsewhere/result" is a
 * perfectly good string and is not a timestamp; interpolated into
 * output_${timestamp}.pdf it is a PDF in a folder nobody asked for.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    TIMESTAMP_FORM,
    makeTimestamp,
    isTimestamp,
    readTimestamp
} = require("../../../src/core/timestamps.js");

test("whatever is produced is accepted", () => {
    // The rule and the thing it describes live in one file so they cannot
    // drift. A month that needs padding, a midnight, a new year's eve.
    const dates = [
        new Date(2026, 0, 1, 0, 0, 0),
        new Date(2026, 8, 4, 7, 5, 9),
        new Date(2026, 11, 31, 23, 59, 59),
        new Date(1999, 5, 15, 12, 30, 45)
    ];

    for (const date of dates) {
        const stamp = makeTimestamp(date);

        assert.equal(isTimestamp(stamp), true, stamp);
        assert.equal(readTimestamp(stamp), stamp);
    }
});

test("a value that is not a timestamp is refused, not repaired", () => {
    // Sanitizing an unusable value into a usable one would name the output
    // something the caller did not ask for and say nothing about it.
    const refused = [
        "/../../elsewhere/result",
        "2026/09/12",
        "2026-09-12_070509",
        "20260904",
        "20260904_07050",
        "20260904_0705099",
        " 20260904_070509",
        "20260904_070509 ",
        "20260904_070509.pdf",
        "",
        "x".repeat(300)
    ];

    for (const value of refused) {
        assert.equal(isTimestamp(value), false, JSON.stringify(value));
        assert.throws(() => readTimestamp(value), /must be YYYYMMDD_HHMMSS/u);
    }
});

test("the refusal says what was wrong and what is wanted", () => {
    assert.throws(() => readTimestamp("2026/09/12"), (error) => {
        assert.match(error.message, /YYYYMMDD_HHMMSS/u);
        assert.match(error.message, /cannot contain a path/u);
        assert.match(error.message, /Received: 2026\/09\/12/u);

        return true;
    });
});

test("the form it names is the form it accepts", () => {
    // A rule stated in prose and enforced by a pattern is two rules until
    // something checks that they agree.
    assert.equal(TIMESTAMP_FORM.length, makeTimestamp(new Date()).length);
});

test("anything that is not a string is refused rather than coerced", () => {
    for (const value of [20260904070509, null, undefined, {}, []]) {
        assert.equal(isTimestamp(value), false, String(value));
    }
});
