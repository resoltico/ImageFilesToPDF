"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { preparePage } = require("../../../src/host/pages.js");
const { issuesOf } = require("../../../src/core/outcomes.js");
const { createFakeHost } = require("../ports/fake-host.cjs");
const { makeJob, imageOf } = require("../ports/fake-job.cjs");

test("normalization reads only the captured input and returns an image-sized page", () => {
    const app = createFakeHost({ files: ["/source.png"] });
    const job = makeJob(app);
    const page = preparePage(job, imageOf("/source.png"), 0);
    assert.equal(page.path, "/tmp/ImageFilesToPDF.X/0-page.png");
    assert.deepEqual([page.placement.widthPixels, page.placement.heightPixels], [595, 396]);
    const thumbnail = app.commands.find((command) => command.includes("'thumbnail'") && !command.includes("nonexistent"));
    assert.ok(thumbnail.includes("'/tmp/ImageFilesToPDF.X/input-0'"));
    assert.ok(!app.commands.some((command) => command.includes("'gravity'")));
    assert.ok(app.files.has("/source.png"));
    assert.ok(!app.files.has("/tmp/ImageFilesToPDF.X/input-0"));
});

test("programming faults during normalization retain fault meaning", () => {
    const app = createFakeHost({ files: ["/source.png"], failures: [["'thumbnail'", new TypeError("adapter bug")]] });
    assert.throws(() => preparePage(makeJob(app), imageOf("/source.png"), 0), (error) => issuesOf(error, "preparation")[0].code === "fault");
});
