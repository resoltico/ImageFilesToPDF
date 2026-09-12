"use strict";

/*
 * What one preparation leaves behind: a page, or nothing at all.
 *
 * The page is written before it is checked, and the check exists because vips
 * can exit zero having produced nothing -- so the failure path is exactly the
 * one where a page is already on disk. It used to stay there until the
 * workspace went at the end of the run, so a batch of failures accumulated
 * one page each.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { preparePage } = require("../../../src/runtime/pages.js");
const { createFakeApp, failing } = require("./fake-app.cjs");
const { makeJob, imageOf } = require("./fake-job.cjs");

test("a page that was made is handed back, not swept up with the rest", () => {
    // The page is the product; the other two are this stage's own working
    // files. Sweeping all three would leave the caller a path to nothing.
    const app = createFakeApp([["'bands'", "3"]]);
    const page = preparePage(makeJob(app), imageOf("/a/x.png"), 0);
    const removals = app.commands.filter((command) => command.startsWith("'/bin/rm'"));

    assert.match(page, /-page\.jpg$/u);
    assert.equal(removals.length, 2, "the two intermediates, and only those");
    assert.ok(
        !removals.some((command) => command.includes("-page.jpg")),
        `the page it is handing back is not removed: ${removals.join(" ")}`
    );
});

test("a page written and then found wanting does not survive the failure", () => {
    // The page is written before it is checked, and the check exists because
    // vips can exit zero having produced nothing -- so the failure path is
    // exactly the one where a page is already on disk. It used to stay there
    // until the workspace went at the end of the run.
    const app = createFakeApp([
        ["'bands'", "3"],
        ["-page.jpg' '-a'", failing("nothing there")]
    ]);

    assert.throws(
        () => preparePage(makeJob(app), imageOf("/a/x.png"), 0),
        /prepared page image/u
    );

    assert.ok(
        app.commands.some((command) =>
            command.startsWith("'/bin/rm'") && command.includes("-page.jpg")),
        "the page this stage made is removed with the rest"
    );
});
