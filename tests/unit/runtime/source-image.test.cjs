"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { imageOf } = require("./fake-job.cjs");
const {
    readBandCount,
    readPageCount,
    assertSinglePage
} = require("../../../src/runtime/source-image.js");
const { readImageSize } = require("../../../src/runtime/image-size.js");
const { createFakeApp, failing } = require("./fake-app.cjs");
const { createFakeHost } = require("./fake-host.cjs");

test("readBandCount parses the header output", () => {
    const app = createFakeApp([["'bands'", " 3 \n"]]);

    assert.equal(readBandCount(app, "/v/vipsheader", "/tmp/a.v"), 3);
});

test("readBandCount rejects output it cannot trust", () => {
    for (const bad of ["", "not-a-number", "0", "-2"]) {
        const app = createFakeApp([["'bands'", bad]]);

        assert.throws(
            () => readBandCount(app, "/v/vipsheader", "/tmp/a.v"),
            /invalid band count/u,
            `expected ${JSON.stringify(bad)} to be rejected`
        );
    }
});

test("a band count of exactly 1 is valid", () => {
    // The guard rejects `< 1`; a `<= 1` boundary would reject greyscale.
    const app = createFakeApp([["'bands'", "1"]]);

    assert.equal(readBandCount(app, "/v/vipsheader", "/tmp/a.v"), 1);
});

test("a multi-page image is refused rather than silently truncated", () => {
    // vips reads page one unless asked for more, so without this the other
    // pages would simply not appear in the PDF and nothing would say so.
    const host = createFakeHost({});
    const job = { app: host, tools: { vipsheader: "/v/vipsheader" } };

    host.pages = 3;
    assert.throws(
        () => assertSinglePage(job, imageOf("/a/scan.tif")),
        (error) => {
            assert.match(error.message, /contains 3 pages/u);
            assert.match(error.message, /split the file/u);

            return true;
        }
    );
});

test("a single-page image passes the check", () => {
    const host = createFakeHost({});
    const job = { app: host, tools: { vipsheader: "/v/vipsheader" } };

    assert.doesNotThrow(
        () => assertSinglePage(job, imageOf("/a/photo.jpg"))
    );
});

test("the header is asked for the right field each time", () => {
    // vipsheader answers whatever field it is given, so asking for the wrong
    // one returns a plausible number rather than an error: the band count
    // would silently become a page count, or vice versa.
    const app = createFakeApp([
        ["'bands'", "3\n"],
        ["'n-pages'", "1\n"]
    ]);

    readBandCount(app, "/v/vipsheader", "/a/x.tif");
    readPageCount(app, "/v/vipsheader", "/a/x.tif");

    assert.deepEqual(app.commands, [
        "'/v/vipsheader' '-f' 'bands' '/a/x.tif'",
        "'/v/vipsheader' '-f' 'n-pages' '/a/x.tif'"
    ]);
});

test("a failed dimension read says which field it was reading", () => {
    const app = createFakeApp([["'height'", failing("unable to load")]]);

    assert.throws(
        () => readImageSize(app, "/v/vipsheader", "/a/x.png"),
        /reading the image height/u
    );
});

test("a failed band read says which step failed", () => {
    // The description is what the user is shown, and "reading image bands" is
    // the only clue that the header, not the conversion, is at fault.
    const app = createFakeApp([["'bands'", failing("1")]]);

    assert.throws(
        () => readBandCount(app, "/v/vipsheader", "/a/x.tif"),
        /reading image bands/u
    );
});
