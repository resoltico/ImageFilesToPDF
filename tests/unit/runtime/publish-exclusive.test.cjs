"use strict";

/*
 * Publishing where a hard link cannot go.
 *
 * An exclusive rename does in one step what the fallback needs three for: it
 * moves the file onto the name and fails rather than replace what is there.
 * Measured through the bridge -- a free name is taken, an occupied one, a
 * folder and a link whose target is gone are refused with what is there left
 * exactly as it was, and the file keeps the number that identifies it, so the
 * publication can still be proved afterwards. FAT32 can do it -- a camera
 * card -- and exFAT cannot do this or a hard link, which is where publication
 * stops and says so.
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
    assert.deepEqual(
        host.commands.filter((command) => command.includes("'/a/out.pdf'") &&
            /\/bin\/(?:cp|mv|rm)/u.test(command)),
        [],
        "and nothing wrote to the output name on the way there"
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
        /could not be saved where it was meant to go/u
    );
    assert.equal(host.sizes.get("/a/theirs.pdf"), 99, "their file is intact");
});

test("a destination that can do neither is told about, not worked around", () => {
    // Taking the name empty and filling it is what this replaced. The name
    // existed before the PDF was in it, and the move and the cleanup that
    // followed acted on whatever was at that name by then -- which no guard
    // fixes, because proving an entry matches something measured a moment ago
    // is not proving it is the file that was created.
    const host = linkless({ files: ["/a/p.pdf"] });
    const job = makeJob(host);

    host.renamer = { rename: () => false };
    job.rename = host.renamer;

    assert.throws(() => publishPdf(job, "/a/p.pdf", "/a/out.pdf"), (error) => {
        assert.match(error.message, /this drive cannot take the output name/u);
        // The half that says what became of the PDF, which is the half the
        // person reading it is waiting for.
        assert.match(error.message, /so the PDF was not put on it/u);

        return true;
    });
    assert.ok(!host.files.has("/a/out.pdf"), "and the name was never created");
    assert.equal(
        [...host.files].filter((file) => file.includes("recovered")).length,
        1,
        "the finished PDF is kept instead"
    );
});

test("a job with no bridge to the rename does not publish by other means", () => {
    // The operation lives on the bridge, and there is no second-best way to
    // put a whole file at a name.
    const host = linkless({ files: ["/a/p.pdf"] });
    const job = makeJob(host);

    job.rename = null;

    assert.throws(
        () => publishPdf(job, "/a/p.pdf", "/a/out.pdf"),
        /this drive cannot take the output name/u
    );
    assert.deepEqual(
        [...host.files].filter((file) => file.includes(".ImageFilesToPDF")),
        [],
        "and the place it made is cleared away"
    );
});
