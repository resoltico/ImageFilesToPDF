"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createAndValidatePdf } = require("../../../src/runtime/staging.js");
const { createFakeApp } = require("./fake-app.cjs");
const { createFakeHost } = require("./fake-host.cjs");
const { makeJob } = require("./fake-job.cjs");

test("createAndValidatePdf imports then validates strictly", () => {
    const app = createFakeApp();

    createAndValidatePdf(makeJob(app), "/a/out.partial.pdf", ["/tmp/1.jpg"]);

    const ordered = app.commands.filter((command) => command.includes("pdfcpu"));

    assert.match(ordered[0], /'import'/u);
    assert.match(ordered[1], /'validate' '--mode=strict'/u);
});

test("a stale partial file is cleared before the PDF is built", () => {
    // Without the pre-clean, pdfcpu could append to a leftover file.
    const host = createFakeHost({ files: ["/a/out.partial.pdf", "/tmp/1.jpg"] });

    createAndValidatePdf(makeJob(host), "/a/out.partial.pdf", ["/tmp/1.jpg"]);

    const [firstCommand] = host.commands;

    assert.match(firstCommand, /'\/bin\/rm'/u);
    assert.match(firstCommand, /out\.partial\.pdf/u);
});
