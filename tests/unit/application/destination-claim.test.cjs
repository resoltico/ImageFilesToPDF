"use strict";

/*
 * Claiming the output name through a copy in the output folder, when the
 * workspace cannot be linked there directly.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { publishPdf } = require("../../../src/application/publish.js");
const { createConversionFixture } = require("../ports/fake-conversion.cjs");
const { makeJob } = require("../ports/fake-job.cjs");

const STAGED = "/w/ready.pdf";

function crossDevice(options = {}) {
    const host = createConversionFixture({ files: [STAGED, ...(options.files ?? [])], faults: options.faults });
    const { link } = host.publication;
    host.publication.link = (from, to) => (from === STAGED ? { state: "cross-device" } : link(from, to));
    const job = makeJob(host);
    job.artifacts.set(STAGED, { path: STAGED, state: "validated" });
    return { host, job };
}

test("one copy in the output folder serves every collision attempt", async () => {
    const { host, job } = crossDevice({ files: ["/a/out.pdf"] });
    const outcome = await publishPdf(job, STAGED, "/a/out.pdf");
    assert.equal(outcome.path, "/a/out 2.pdf");
    assert.equal(host.events.filter(([event]) => event === "copyBeside").length, 1);
});

test("an original that changes during the copy is reported with where the copy went", async () => {
    let area = null;
    const { host, job } = crossDevice({ faults: { copyBeside: (from, to) => { area = to; host.files.set(STAGED, { identity: "changed", size: 1024 }); } } });
    await assert.rejects(() => publishPdf(job, STAGED, "/a/out.pdf"), (error) => {
        const { candidate } = error.issues[0].diagnostic;
        assert.equal(candidate.folder, area.slice(0, area.lastIndexOf("/")));
        assert.equal(candidate.size, 1024);
        assert.ok(candidate.identity);
        assert.equal(error.cause, undefined);
        return true;
    });
});

test("a copy that failed while the original changed keeps the copy's failure as the cause", async () => {
    const copyFailure = new Error("No space left on device.");
    const { host, job } = crossDevice({ faults: { copyBeside: () => { host.files.set(STAGED, { identity: "changed", size: 1024 }); return copyFailure; } } });
    await assert.rejects(() => publishPdf(job, STAGED, "/a/out.pdf"), (error) => {
        assert.match(error.cause.message, /PDF could not be copied/u);
        assert.equal(Object.keys(error.issues[0].diagnostic.candidate).filter((key) => error.issues[0].diagnostic.candidate[key] !== undefined).join(), "folder");
        return true;
    });
});

test("where nothing can be linked, collision attempts rename the one copy", async () => {
    const host = createConversionFixture({ files: [STAGED, "/card/out.pdf"] });
    const { rename } = host.publication;
    host.publication.link = () => ({ state: "unsupported" });
    host.publication.rename = (from, to) => rename(from, to);
    const job = makeJob(host);
    job.artifacts.set(STAGED, { path: STAGED, state: "validated" });
    const outcome = await publishPdf(job, STAGED, "/card/out.pdf");
    assert.equal(outcome.path, "/card/out 2.pdf");
    assert.equal(host.events.filter(([event]) => event === "copyBeside").length, 1);
});
