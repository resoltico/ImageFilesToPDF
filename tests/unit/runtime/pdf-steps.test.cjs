"use strict";

/*
 * Which step failed is the whole content of a failure message: "creating" and
 * "validating" send someone to different places, and a PDF that was reported
 * written but is not there is a third thing again.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { createSeparatePdfs } = require("../../../src/runtime/pdf.js");
const { failing } = require("./fake-app.cjs");
const { createFakeHost } = require("./fake-host.cjs");
const { makeJob, imageOf } = require("./fake-job.cjs");

const images = [imageOf("/a/x.png")];

function failureFrom(host) {
    const { failures } = createSeparatePdfs(makeJob(host), images);

    assert.equal(failures.length, 1, "exactly one image, so exactly one failure");

    return failures[0].message;
}

test("a rejected PDF is reported as a validation failure", () => {
    const message = failureFrom(createFakeHost({
        files: ["/a/x.png"],
        failures: [["'validate'", failing("xref table is corrupt")]]
    }));

    assert.match(message, /validating PDF/u, message);
    assert.match(message, /xref table is corrupt/u);
});

test("a failed import is reported as a creation failure", () => {
    const message = failureFrom(createFakeHost({
        files: ["/a/x.png"],
        failures: [["'import'", failing("unsupported page size")]]
    }));

    assert.match(message, /creating PDF/u, message);
});

test("a PDF that pdfcpu reported writing but did not is named for what it is", () => {
    // pdfcpu exits zero and leaves nothing behind: without this the next step
    // would validate a file that is not there and blame validation.
    const message = failureFrom(createFakeHost({
        files: ["/a/x.png"],
        failures: [["'import'", ""]]
    }));

    assert.match(message, /partial PDF/u, message);
});

test("nothing is removed before there is anything to remove", () => {
    // Naming happens inside the try, so a failure there leaves no staged path.
    // Running rm on the empty string would be a command about nothing.
    const host = createFakeHost({
        files: ["/a/x.png"],
        failures: [["/bin/test", ""]]
    });

    assert.match(failureFrom(host), /unique output filename/u);
    assert.deepEqual(
        host.commands.filter((command) => command.includes("/bin/rm")),
        []
    );
});
