"use strict";

/*
 * What a finished run tells its caller.
 *
 * A headless caller gets one thing from osascript — the returned value on
 * success, the error on failure — so an incomplete run must fail while still
 * putting the receipt where the caller can read it.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    reportHeadless,
    reportResult
} = require("../../../src/runtime/reporting.js");
const { createFakeApp } = require("./fake-app.cjs");

const job = { settings: { mode: "separate" } };

test("a headless run that lost nothing returns its receipt", () => {
    const result = { outputs: ["/a/x.pdf"], failures: [], rejected: [] };

    assert.equal(
        reportResult(createFakeApp(), job, result, { headless: true }),
        JSON.stringify(result)
    );
});

test("a headless run that lost something fails, and says what", () => {
    // Returning the receipt here would exit zero on a run that dropped a
    // file, and a caller checking the status would never look further.
    const app = createFakeApp();

    assert.throws(
        () => reportResult(app, job, {
            outputs: ["/a/x.pdf"],
            failures: [{ name: "b.png", message: "broke", command: "" }],
            rejected: []
        }, { headless: true }),
        (error) => {
            assert.match(error.message, /not completely honoured/u);
            assert.match(error.message, /1 failed/u);

            return true;
        }
    );
    assert.deepEqual(app.dialogs, [], "and it does not stop to ask anything");
});

test("a rejection alone is enough to fail a headless run", () => {
    assert.throws(
        () => reportResult(createFakeApp(), job, {
            outputs: ["/a/x.pdf"],
            failures: [],
            rejected: [{ name: "anim.gif", reason: "not a supported format" }]
        }, { headless: true }),
        /1 not converted/u
    );
});

test("an interactive run shows the completion and answers with its outputs", () => {
    const app = createFakeApp();
    const outputs = reportResult(app, job, {
        outputs: ["/a/x.pdf"],
        failures: [],
        elapsed: "1 second(s)"
    }, { headless: false, pageCount: 1 });

    assert.deepEqual(outputs, ["/a/x.pdf"]);
    assert.equal(app.dialogs.length, 1);
    assert.match(app.dialogs[0].message, /Created 1 PDF\./u);
    assert.match(app.dialogs[0].message, /\/a\//u, "and where it went");
});

test("the receipt goes out whole, and on its own line", () => {
    // The caller reads standard output a line at a time and parses what it
    // gets: an unterminated line waits for a newline that never comes, and an
    // empty one parses as nothing at all.
    const written = [];
    const result = { outputs: [], failures: [{ name: "a.png", message: "broke", command: "" }], rejected: [] };

    assert.throws(() => reportHeadless(result, (text) => written.push(text)));
    assert.deepEqual(written, [`${JSON.stringify(result)}\n`]);
});

test("a complete run writes no receipt, because it returns one", () => {
    const written = [];

    assert.equal(
        reportHeadless({ outputs: ["/a.pdf"], failures: [], rejected: [] },
            (text) => written.push(text)),
        '{"outputs":["/a.pdf"],"failures":[],"rejected":[]}'
    );
    assert.deepEqual(written, []);
});
