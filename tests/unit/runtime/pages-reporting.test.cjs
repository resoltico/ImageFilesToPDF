"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { preparePage, preparePages } = require("../../../src/runtime/pages.js");
const {
    createSeparatePdfs
} = require("../../../src/runtime/pdf-separate.js");
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

function watcher(job) {
    const said = [];

    job.progress = {
        stopped: () => false,
        beginning: (index, name) => said.push(`begin ${index} ${name}`),
        about: (summary) => said.push(`about ${summary}`),
        finished: (description) => said.push(`done ${description}`),
        phase() {
            return undefined;
        }
    };

    return said;
}

test("the file being prepared is counted from one, not from zero", () => {
    // It is the number someone waiting reads. Counting from zero would show
    // "0 of 20" for the first of twenty.
    const app = createFakeHost({ files: ["/a/x.png", "/a/y.png"] });
    const job = makeJob(app);
    const said = watcher(job);

    preparePages(job, [imageOf("/a/x.png"), imageOf("/a/y.png")]);

    assert.deepEqual(said.filter((line) => line.startsWith("begin")), [
        "begin 1 x.png",
        "begin 2 y.png"
    ]);
});

test("preparing a page reports nothing of its own", () => {
    // It is one step of an image, not an image. Announcing itself from here
    // put the opening of a unit one level below the only code that knows an
    // image is one of several -- and left the closing three modules away.
    const app = createFakeHost({ files: ["/a/x.png"] });
    const job = makeJob(app);
    const said = watcher(job);

    preparePage(job, imageOf("/a/x.png"), 0);

    assert.deepEqual(said, []);
});

test("a separate run opens a unit for each image it starts", () => {
    const app = createFakeHost({ files: ["/a/x.png", "/a/y.png"] });
    const job = makeJob(app);
    const said = watcher(job);

    createSeparatePdfs(job, [imageOf("/a/x.png"), imageOf("/a/y.png")]);

    assert.deepEqual(said, [
        "begin 1 x.png",
        "done Saved",
        "begin 2 y.png",
        "done Saved"
    ]);
});

test("a prepared page is a unit of work that has finished, and says so", () => {
    // completedUnitCount holds work that is done, so it moves when a page is
    // finished rather than when one is started -- and what it says while it
    // moves is the only description anybody waiting will read.
    const app = createFakeHost({ files: ["/a/x.png", "/a/y.png"] });
    const job = makeJob(app);
    const said = watcher(job);

    preparePages(job, [imageOf("/a/x.png"), imageOf("/a/y.png")]);

    assert.deepEqual(said, [
        "begin 1 x.png",
        "done Preparing",
        "begin 2 y.png",
        "done Preparing"
    ]);
});
