"use strict";

/*
 * Publishing where a hard link cannot go.
 *
 * An exclusive rename does in one step what the fallback needs three for: it
 * moves the file onto the name and fails rather than replace what is there.
 * Measured through the bridge -- a free name is taken, an occupied one, a
 * folder and a link whose target is gone are refused with what is there left
 * exactly as it was, and the file keeps the number that identifies it, so the
 * publication can still be proved afterwards. FAT32 can do it; exFAT cannot,
 * which is the only reason the last resort still exists.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { publishPdf } = require("../../../src/runtime/publish.js");
const { createFakeHost } = require("./fake-host.cjs");
const { makeJob } = require("./fake-job.cjs");

const DENIED = "Operation not permitted";
const DIRECT_CLAIM = "ln' '/a/p.pdf'";

function linkless(settings) {
    return createFakeHost({
        ...settings,
        failures: [[DIRECT_CLAIM, new Error(DENIED)], ...settings.failures ?? []]
    });
}

test("where a link cannot be made, one rename publishes", () => {
    const host = linkless({ files: ["/a/p.pdf"] });

    publishPdf(makeJob(host), "/a/p.pdf", "/a/out.pdf");

    assert.ok(host.files.has("/a/out.pdf"));
    assert.equal(
        host.commands.filter((command) => command.includes("/bin/sh")).length,
        0,
        "and the last resort is not reached at all"
    );
});

test("the copy is moved out of the place it was made in, which then goes", () => {
    const host = linkless({ files: ["/a/p.pdf"] });

    publishPdf(makeJob(host), "/a/p.pdf", "/a/out.pdf");

    assert.deepEqual(
        [...host.files].filter((file) => file.includes(".ImageFilesToPDF")),
        [],
        "nothing of the run is left in the folder"
    );
    assert.match(
        host.commands.at(-2),
        /'\/bin\/rmdir' '\/a\/\.ImageFilesToPDF-[^']+'/u,
        "the place is cleared away"
    );
});

test("a name that is taken is refused, and what is there is untouched", () => {
    // The rename fails and so would the link; what the refusal meant is
    // decided by asking whether the name is taken, because errno does not
    // reach here.
    const host = linkless({
        files: ["/a/p.pdf", "/a/theirs.pdf"],
        failures: [["test' '-e' '/a/theirs.pdf' '-o'", new Error("test failed")]]
    });

    host.sizes.set("/a/theirs.pdf", 99);

    assert.throws(
        () => publishPdf(makeJob(host), "/a/p.pdf", "/a/theirs.pdf"),
        /could not be published/u
    );
    assert.equal(host.sizes.get("/a/theirs.pdf"), 99, "their file is intact");
});

test("a host with no bridge to the rename still publishes", () => {
    // The bridge is where that operation lives, and a job without one is not
    // a job that cannot publish: it takes the name the long way instead.
    const host = linkless({ files: ["/a/p.pdf"] });
    const job = makeJob(host);

    job.rename = null;

    publishPdf(job, "/a/p.pdf", "/a/out.pdf");

    assert.ok(host.files.has("/a/out.pdf"));
    assert.equal(
        host.commands.filter((command) => command.includes("/bin/sh")).length,
        1,
        "by taking the name and filling it"
    );
});
