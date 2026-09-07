"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { preparePage } = require("../../../src/runtime/pages.js");
const { createFakeApp, failing } = require("./fake-app.cjs");
const { createFakeHost } = require("./fake-host.cjs");
const { makeJob, imageOf } = require("./fake-job.cjs");

test("each stage names itself when it fails", () => {
    // The description is the only thing telling a person which stage broke.
    const stages = [
        ["'thumbnail'", /preparing the image/u],
        ["'flatten'", /flattening the image/u]
    ];

    for (const [needle, expected] of stages) {
        const app = createFakeApp([
            ["'n-pages'", "1\n"],
            ["'bands'", "4\n"],
            [needle, failing("broke")]
        ]);

        assert.throws(() => preparePage(makeJob(app), imageOf("/a/x.png"), 0), expected);
    }
});

test("the file being prepared is counted from one, not from zero", () => {
    // It is the number someone waiting reads. Counting from zero would show
    // "0 of 20" for the first of twenty.
    const app = createFakeHost({ files: ["/a/x.png"] });
    const job = makeJob(app);
    const said = [];

    job.progress = {
        file: (index, name) => said.push(`${index} ${name}`),
        phase() {
            return undefined;
        }
    };

    preparePage(job, imageOf("/a/x.png"), 0);
    preparePage(job, imageOf("/a/y.png"), 4);

    assert.deepEqual(said, ["1 x.png", "5 y.png"]);
});
