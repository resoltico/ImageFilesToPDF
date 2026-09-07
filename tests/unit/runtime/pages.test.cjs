"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { preparePage, preparePages } = require("../../../src/runtime/pages.js");
const { createFakeApp, failing } = require("./fake-app.cjs");
const { createFakeHost } = require("./fake-host.cjs");
const { makeJob, imageOf } = require("./fake-job.cjs");

test("an opaque image skips the flatten stage", () => {
    const app = createFakeApp([["'bands'", "3"]]);
    const pagePath = preparePage(makeJob(app), imageOf("/a/x.png"), 0);

    assert.equal(pagePath, "/tmp/ImageFilesToPDF.X/000001-page.jpg");
    assert.equal(app.commands.filter((command) => command.includes("'flatten'")).length, 0);
    assert.equal(app.commands.filter((command) => command.includes("'thumbnail'")).length, 1);
    assert.equal(app.commands.filter((command) => command.includes("'gravity'")).length, 1);
});

test("an image with alpha is flattened onto the background first", () => {
    const app = createFakeApp([["'bands'", "4"]]);

    preparePage(makeJob(app), imageOf("/a/x.png"), 0);

    const flatten = app.commands.find((command) => command.includes("'flatten'"));

    assert.ok(flatten, "expected a flatten stage");
    assert.match(flatten, /--background=255/u);
    // gravity must then read the flattened file, not the prepared one.
    assert.match(
        app.commands.find((command) => command.includes("'gravity'")),
        /000001-flattened\.v/u
    );
});

test("the thumbnail stage is ICC aware and sized to the placement", () => {
    const app = createFakeApp([["'bands'", "3"]]);

    preparePage(makeJob(app), imageOf("/a/x.png"), 0);

    const thumbnail = app.commands.find((command) => command.includes("'thumbnail'"));

    assert.match(thumbnail, /--export-profile=srgb/u);
    // The size is the placement, computed from the source dimensions, so no
    // fitting flag is passed: --size=down here would refuse the enlargement
    // that keeps the picture the same physical size at every resolution.
    assert.ok(!/--size=/u.test(thumbnail), thumbnail);
});

test("intermediates are removed even when a stage fails", () => {
    const app = createFakeApp([
        ["'bands'", "3"],
        ["'gravity'", failing("vips died")]
    ]);

    assert.throws(
        () => preparePage(makeJob(app), imageOf("/a/x.png"), 0),
        /laying out the page/u
    );

    const removals = app.commands.filter((command) => command.startsWith("'/bin/rm'"));

    assert.equal(removals.length, 2, "prepared and flattened must both be removed");
});

test("a stage that reports success but writes nothing is detected", () => {
    // vips exiting zero without producing its output is precisely what
    // verifyFileWritten exists to catch.
    for (const [stage, label] of [
        ["'thumbnail'", "prepared image"],
        ["'flatten'", "flattened image"],
        ["'gravity'", "prepared page image"]
    ]) {
        const app = createFakeHost({
            files: ["/a/x.png"],
            bands: 4,
            failures: [[stage, ""]]
        });

        assert.throws(
            () => preparePage(makeJob(app), imageOf("/a/x.png"), 0),
            new RegExp(`${label} is not a file with anything in it`, "u"),
            `${stage} producing nothing must be caught`
        );
    }
});

test("preparePages numbers the pages in order", () => {
    const app = createFakeApp([["'bands'", "3"]]);
    const files = ["a.png", "b.png", "c.png"].map((name) => ({ path: `/a/${name}`, originalName: name }));

    assert.deepEqual(preparePages(makeJob(app), files), [
        "/tmp/ImageFilesToPDF.X/000001-page.jpg",
        "/tmp/ImageFilesToPDF.X/000002-page.jpg",
        "/tmp/ImageFilesToPDF.X/000003-page.jpg"
    ]);
});


test("a multi-page image is refused before any page is prepared", () => {
    // The refusal lives in preparePage, and nothing here proved it was still
    // wired in: removing the call would silently restore the old behaviour of
    // taking page one and dropping the rest.
    const app = createFakeApp([["'n-pages'", "3\n"]]);

    assert.throws(
        () => preparePage(makeJob(app), imageOf("/a/x.png"), 0),
        /contains 3 pages/u
    );
    assert.equal(
        app.commands.filter((command) => command.includes("thumbnail")).length,
        0,
        "nothing may be converted before the page count is known"
    );
});
