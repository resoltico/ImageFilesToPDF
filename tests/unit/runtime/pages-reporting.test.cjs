"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { preparePage, preparePages } = require("../../../src/runtime/pages.js");
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
        beginning: (index, name) => said.push(`${index} ${name}`),
        finished() {
            return undefined;
        },
        phase() {
            return undefined;
        }
    };

    preparePage(job, imageOf("/a/x.png"), 0);
    preparePage(job, imageOf("/a/y.png"), 4);

    assert.deepEqual(said, ["1 x.png", "5 y.png"]);
});

test("a prepared page is a unit of work that has finished, and says so", () => {
    // completedUnitCount holds work that is done, so it moves when a page is
    // finished rather than when one is started -- and what it says while it
    // moves is the only description anybody waiting will read.
    const app = createFakeHost({ files: ["/a/x.png", "/a/y.png"] });
    const job = makeJob(app);
    const said = [];

    job.progress = {
        beginning: (index) => said.push(`begin ${index}`),
        finished: (description) => said.push(`done ${description}`),
        phase() {
            return undefined;
        }
    };

    preparePages(job, [imageOf("/a/x.png"), imageOf("/a/y.png")]);

    assert.deepEqual(said, [
        "begin 1",
        "done Preparing",
        "begin 2",
        "done Preparing"
    ]);
});
