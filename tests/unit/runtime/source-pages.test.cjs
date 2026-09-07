"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { imageOf } = require("./fake-job.cjs");
const {
    readPageCount,
    assertSinglePage
} = require("../../../src/runtime/source-image.js");
const { readImageSize } = require("../../../src/runtime/image-size.js");
const { createFakeApp, failing } = require("./fake-app.cjs");

test("a format with no n-pages field genuinely has one page", () => {
    // vipsheader says so precisely: the image loaded and the field is absent.
    // This is the only failure that means one page.
    const app = createFakeApp([["'n-pages'", failing(
        'vips_image_get: field "n-pages" not found'
    )]]);

    assert.deepEqual(readPageCount(app, "/v/vipsheader", "/a/x.jpg"), { pages: 1 });
});

test("a count the format does carry is read", () => {
    const app = createFakeApp([["'n-pages'", "3\n"]]);

    assert.deepEqual(readPageCount(app, "/v/vipsheader", "/a/x.tif"), { pages: 3 });
});

test("a file that will not load leaves the count unknown, not one", () => {
    // Returning one here would let a multi-page file through the check that
    // exists to refuse it, on the strength of a command that failed.
    const app = createFakeApp([["'n-pages'", failing(
        "VipsForeignLoad: not a known file format"
    )]]);
    const count = readPageCount(app, "/v/vipsheader", "/a/x.tif");

    assert.equal(count.pages, undefined);
    assert.match(count.unknown, /not a known file format/u);
});

test("output that is not a whole number leaves the count unknown", () => {
    // parseInt would read "2junk" as two.
    for (const output of ["2junk", "", "abc", "-1", "0", "1.5"]) {
        const app = createFakeApp([["'n-pages'", `${output}\n`]]);
        const count = readPageCount(app, "/v/vipsheader", "/a/x.tif");

        assert.equal(count.pages, undefined, `${JSON.stringify(output)} is not a count`);
        assert.match(count.unknown, /reported the page count as/u);
    }
});

test("an unknown count is refused, and says why", () => {
    const app = createFakeApp([["'n-pages'", failing("vipsheader is not installed")]]);

    assert.throws(
        () => assertSinglePage(
            { app, tools: { vipsheader: "/v/vipsheader" } },
            imageOf("/a/x.tif")
        ),
        (error) => {
            assert.match(error.message, /could not be checked for multiple pages/u);
            assert.match(error.message, /vipsheader is not installed/u);

            return true;
        }
    );
});

test("a dimension that is not a usable number is refused", () => {
    // The placement is computed from these, so a nonsense width would put the
    // image somewhere nonsensical rather than failing.
    for (const bad of ["0", "-5", "abc", ""]) {
        const app = createFakeApp([["'width'", `${bad}\n`]]);

        assert.throws(
            () => readImageSize(app, "/v/vipsheader", "/a/x.png"),
            /vipsheader returned an invalid width/u,
            bad
        );
    }
});

test("the dimensions are read from the image itself", () => {
    const app = createFakeApp([["'width'", "1200\n"], ["'height'", "800\n"]]);

    assert.deepEqual(
        readImageSize(app, "/v/vipsheader", "/a/x.png"),
        { width: 1200, height: 800 }
    );
});

test("a count of ten or more is read whole", () => {
    // A single-digit pattern would call a twelve-page scan unknown, and
    // refusing it for the wrong reason is still refusing it for a reason
    // nobody can act on.
    for (const pages of ["10", "12", "247"]) {
        const app = createFakeApp([["'n-pages'", `${pages}\n`]]);

        assert.deepEqual(
            readPageCount(app, "/v/vipsheader", "/a/x.tif"),
            { pages: Number(pages) },
            pages
        );
    }
});

test("a twelve-page file is refused, and the count is in the message", () => {
    const app = createFakeApp([["'n-pages'", "12\n"]]);

    assert.throws(
        () => assertSinglePage(
            { app, tools: { vipsheader: "/v/vipsheader" } },
            imageOf("/a/x.tif")
        ),
        /contains 12 pages/u
    );
});

test("a failed page-count read says that is what it was doing", () => {
    // This one is reported as the reason the file was refused, so it has to
    // say what was being attempted rather than only what went wrong.
    const app = createFakeApp([["'n-pages'", failing("unable to load")]]);

    assert.match(
        readPageCount(app, "/v/vipsheader", "/a/x.tif").unknown,
        /reading the page count/u
    );
});
