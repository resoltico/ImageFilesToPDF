"use strict";

/*
 * What belongs to somebody else.
 *
 * A run writes only to names it took, and removes only names it recorded
 * taking. Both used to be worked out from pathnames instead: a file another
 * program had put at the staging name was treated as this run's because the
 * copy that failed had been aimed at it, and a document inside a folder that
 * appeared at the output path was deleted for having a name this run
 * recognised.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { publishPdf } = require("../../../src/runtime/publish.js");
const { createFakeHost } = require("./fake-host.cjs");
const { makeJob } = require("./fake-job.cjs");

const DENIED = "Operation not permitted";
const DIRECT_CLAIM = "ln' '/a/p.pdf'";

function recovered(host) {
    return [...host.files].filter((file) => file.includes("recovered"));
}

test("a place this run could not make is not one it may use", () => {
    // Whatever is at a name this run did not make is not this run's to write
    // into or to remove. Publication stops instead.
    const host = createFakeHost({
        files: ["/a/p.pdf"],
        failures: [
            [DIRECT_CLAIM, new Error(DENIED)],
            // Whatever name this attempt asks for is already occupied.
            ["/bin/mkdir", new Error("mkdir: File exists")]
        ]
    });
    const job = makeJob(host);

    assert.throws(() => publishPdf(job, "/a/p.pdf", "/a/out.pdf"), (error) => {
        assert.match(error.message, /File exists/u);

        return true;
    });
    assert.equal(
        host.commands.filter((command) => command.includes("/bin/cp")).length,
        0,
        "nothing was copied over it"
    );
    assert.deepEqual(
        host.commands.filter((command) => command.includes("/bin/rm") &&
            command.includes(".ImageFilesToPDF")),
        [],
        "and nothing removed it"
    );
    assert.equal(recovered(host).length, 1, "and the finished PDF was kept");
});

test("a PDF that cannot be identified is not published at all", () => {
    // Publication is proved by comparing what the output path holds against
    // what was published. With nothing to compare against there is no proof
    // to be had, so the run stops with the PDF still in hand.
    const host = createFakeHost({
        files: ["/a/p.pdf"],
        failures: [["/usr/bin/stat", new Error(DENIED)]]
    });
    const job = makeJob(host);

    assert.throws(() => publishPdf(job, "/a/p.pdf", "/a/out.pdf"), (error) => {
        assert.match(error.message, /could not be measured/u);

        return true;
    });
    assert.equal(
        host.commands.filter((command) => command.includes("/bin/ln")).length,
        0,
        "and nothing was attempted against the name"
    );
    assert.equal(recovered(host).length, 1, "the PDF was kept");
});

test("a document inside whatever replaced the output name is not removed", () => {
    // A folder can appear at the output path, and ln links into one rather
    // than refusing it -- so a link left inside is real. It is this run's
    // only if it is the file this run published, and a name that merely looks
    // familiar is not: an unrelated document with the same basename as the
    // file we claimed from was deleted for it.
    const host = createFakeHost({
        files: ["/w/staged-audit.pdf", "/a/out.pdf/staged-audit.pdf"],
        // What the output path holds by the time it is asked is not ours.
        failures: [["stat' '-f%d:%i:%z' '/a/out.pdf'", "16777232:999:4096"]]
    });
    const job = makeJob(host);

    assert.throws(
        () => publishPdf(job, "/w/staged-audit.pdf", "/a/out.pdf"),
        /does not hold the PDF this run published/u
    );
    assert.ok(
        host.files.has("/a/out.pdf/staged-audit.pdf"),
        "the document this run did not put there survives"
    );
    assert.deepEqual(
        host.commands.filter((command) => command.includes("/bin/rm") &&
            command.includes("/a/out.pdf/")),
        [],
        "and nothing inside it was even aimed at"
    );
    assert.equal(recovered(host).length, 1, "and ours was kept");
});
