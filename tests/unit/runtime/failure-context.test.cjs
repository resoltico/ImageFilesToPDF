"use strict";

/*
 * A failure is wrapped twice on its way out: once with the name of the image
 * it happened to, once with the log's description. Only the innermost error
 * carries the command that failed, so each layer has to keep the one beneath
 * it or the log ends up with a sentence and no evidence.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { preparePages } = require("../../../src/runtime/pages.js");
const { commandOf } = require("../../../src/core/errors.js");
const { failing } = require("./fake-app.cjs");
const { createFakeHost } = require("./fake-host.cjs");
const { makeJob } = require("./fake-job.cjs");

const image = { path: "/a/x.png", originalName: "x.png" };

test("naming the image keeps the command that failed underneath it", () => {
    const app = createFakeHost({
        files: ["/a/x.png"],
        failures: [["'thumbnail'", failing("vips: unable to load")]]
    });

    assert.throws(() => preparePages(makeJob(app), [image]), (error) => {
        assert.match(error.message, /^x\.png: /u, "the image is named");
        assert.match(commandOf(error), /thumbnail/u, "and the command survives");

        return true;
    });
});
