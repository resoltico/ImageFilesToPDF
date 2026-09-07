"use strict";

/*
 * Every page path goes on one command line, and a command line has a size.
 * pdfcpu appends to a PDF that already exists, so the pages are handed over
 * in groups -- which introduces a failure a single import did not have: a
 * batch that exits zero having added nothing.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { createAndValidatePdf } = require("../../../src/runtime/staging.js");
const { failing } = require("./fake-app.cjs");
const { createFakeHost } = require("./fake-host.cjs");
const { makeJob } = require("./fake-job.cjs");

test("a job too large for one command is imported in several", () => {
    // pdfcpu appends to a PDF that already exists, in the order it is given
    // the pages, so there is no ceiling left to hit.
    const host = createFakeHost({ files: ["/a/x.png"] });
    const job = makeJob(host);
    const pages = Array.from(
        { length: 4000 },
        (unused, index) => `${job.workspace}/page_${index}.jpg`
    );

    createAndValidatePdf(job, `${job.workspace}/out.pdf`, pages);

    const imports = host.commands.filter((command) => command.includes("'import'"));

    assert.ok(imports.length > 1, `expected several imports, got ${imports.length}`);
    // Each command is filled, not handed one page at a time. Measuring the
    // fixed part of the command with every page already in it leaves nothing
    // of the budget, and a job of four thousand pages becomes four thousand
    // invocations of pdfcpu -- correct, and minutes of spawning processes.
    assert.ok(
        (imports[0].match(/page_/gu) ?? []).length > 1,
        "a command carrying one page means the budget was measured wrong"
    );
    assert.equal(
        imports.map((command) => command.split("page_").length - 1)
            .reduce((total, count) => total + count, 0),
        pages.length,
        "every page was imported exactly once"
    );
});

test("a batch that appended nothing is caught", () => {
    // Chunking introduces a failure a single import did not have: pdfcpu
    // exiting zero having added no pages. The count is asked for only when
    // the pages were handed over in more than one group.
    const host = createFakeHost({
        files: ["/a/x.png"],
        failures: [["'info'", "          Page count: 3\n"]]
    });
    const job = makeJob(host);
    const pages = Array.from(
        { length: 4000 },
        (unused, index) => `${job.workspace}/page_${index}.jpg`
    );

    assert.throws(
        () => createAndValidatePdf(job, `${job.workspace}/out.pdf`, pages),
        /the PDF has 3 pages where 4000 were imported/u
    );
});

test("an ordinary job is not asked how many pages it has", () => {
    const host = createFakeHost({ files: ["/a/x.png"] });
    const job = makeJob(host);

    createAndValidatePdf(job, `${job.workspace}/out.pdf`, [`${job.workspace}/p.jpg`]);

    assert.deepEqual(
        host.commands.filter((command) => command.includes("'info'")),
        []
    );
});

test("each stage of building the PDF is announced", () => {
    // The phases are what someone waiting sees, so they are pinned rather
    // than left to whatever string happens to be there.
    const host = createFakeHost({ files: ["/a/x.png"] });
    const job = makeJob(host);
    const said = [];

    job.progress = {
        beginning() { return undefined; },
        finished() { return undefined; },
        phase: (name) => said.push(name)
    };
    createAndValidatePdf(job, `${job.workspace}/out.pdf`, [`${job.workspace}/p.jpg`]);

    assert.deepEqual(said, ["Creating PDF", "Validating PDF"]);
});

test("a page count that cannot be read says what it was doing", () => {
    const host = createFakeHost({
        files: ["/a/x.png"],
        failures: [["'info'", failing("pdfcpu: cannot read xref")]]
    });
    const job = makeJob(host);
    const pages = Array.from(
        { length: 4000 },
        (unused, index) => `${job.workspace}/page_${index}.jpg`
    );

    assert.throws(
        () => createAndValidatePdf(job, `${job.workspace}/out.pdf`, pages),
        /counting the pages/u
    );
});
