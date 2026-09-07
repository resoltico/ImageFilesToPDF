"use strict";

/*
 * The ways publication can fail, and how each is told apart from success.
 *
 * Neither mv -n nor cp -n reports declining: both exit zero and do nothing.
 * A copy is not atomic either, so a file at the destination is not evidence
 * that it holds our PDF. What is left under the staging name, and what the
 * sizes say, is what settles it.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { publishPdf } = require("../../../src/runtime/publish.js");
const { createFakeHost } = require("./fake-host.cjs");
const { makeJob } = require("./fake-job.cjs");

const DENIED = "Operation not permitted";
const STAGED_MOVE = "mv' '-n' '/a/p.pdf'";

function refusing(...tools) {
    return tools.map((tool) => [tool, new Error(DENIED)]);
}

test("an occupied destination is refused, and the PDF is set aside", () => {
    // Nothing is attempted against the destination -- but the staged file is
    // a finished, validated PDF, so it goes somewhere it will survive and the
    // message says where. It used to be left in the workspace, which the run
    // removes on its way out.
    const host = createFakeHost({ files: ["/a/p.pdf", "/a/out.pdf"] });
    const job = makeJob(host);

    assert.throws(() => publishPdf(job, "/a/p.pdf", "/a/out.pdf"), (error) => {
        assert.match(error.message, /became occupied before publication/u);
        assert.match(error.message, /The finished PDF has been kept here/u);

        return true;
    });
    assert.equal(
        host.commands.filter((command) => command.includes("/bin/cp")).length,
        0,
        "nothing was copied"
    );
    assert.ok(!host.files.has("/a/p.pdf"), "it is not where it was built");
    assert.equal(
        [...host.files].filter((file) => file.includes("recovered")).length,
        1,
        "it is in a recovery folder"
    );
    assert.equal(job.unpublished.size, 0, "so the job no longer owns it");
});

test("when the PDF cannot be got into the folder at all, both refusals are named", () => {
    // The mv message is what made the original failure diagnosable at all,
    // and the cp message is what says the fallback was tried.
    const host = createFakeHost({
        files: ["/a/p.pdf"],
        failures: refusing(STAGED_MOVE, "/bin/cp")
    });

    assert.throws(() => publishPdf(makeJob(host), "/a/p.pdf", "/a/out.pdf"), (error) => {
        assert.match(error.message, /moving the PDF into the output folder/u);
        assert.match(error.message, /copying the PDF into the output folder/u);

        return true;
    });
});

test("a failed publication keeps the finished PDF and says where", () => {
    // It has been imported and validated by this point. Deleting it destroys
    // completed work over a failure that has nothing to do with its contents.
    const host = createFakeHost({
        files: ["/a/p.pdf"],
        failures: refusing(STAGED_MOVE, "/bin/cp")
    });

    assert.throws(() => publishPdf(makeJob(host), "/a/p.pdf", "/a/out.pdf"), (error) => {
        assert.match(error.message, /The finished PDF has been kept here:/u);

        return true;
    });
    assert.equal(
        [...host.files].filter((file) => file.includes("recovered")).length,
        1,
        "the finished PDF must survive"
    );
    assert.ok(!host.files.has("/a/out.pdf"), "and the output name is untouched");
});

test("a published file that is empty is still a failure", () => {
    const host = createFakeHost({
        files: ["/a/p.pdf"],
        emptyFiles: ["/a/out.pdf"]
    });

    assert.throws(
        () => publishPdf(makeJob(host), "/a/p.pdf", "/a/out.pdf"),
        /output PDF is not a file with anything in it/u
    );
});

test("the failure reads as paragraphs, not as one run-on line", () => {
    // It goes in front of a person in a dialog, under a heading sentence.
    const host = createFakeHost({
        files: ["/a/p.pdf"],
        failures: refusing(STAGED_MOVE, "/bin/cp")
    });

    assert.throws(() => publishPdf(makeJob(host), "/a/p.pdf", "/a/out.pdf"), (error) => {
        // The heading stands apart from the detail beneath it; run together
        // they read as one sentence about something else.
        assert.ok(error.message.startsWith(
            "The PDF could not be published without overwriting another file.\n\n"
        ), error.message);

        return true;
    });
});

test("a staging file nothing is holding on to does not stay in the folder", () => {
    // It is hidden and named for this attempt, so it is this attempt's to
    // remove -- but only while the finished PDF is somewhere else.
    const host = createFakeHost({
        files: ["/a/p.pdf"],
        failures: [[STAGED_MOVE, new Error(DENIED)], ["/bin/ln", new Error(DENIED)],
            ["mv' '-n' '/a/.ImageFilesToPDF", new Error(DENIED)]]
    });

    assert.throws(() => publishPdf(makeJob(host), "/a/p.pdf", "/a/out.pdf"), /could not be published/u);
    assert.deepEqual(
        [...host.files].filter((file) => file.includes(".part")),
        [],
        "the copy that could not be claimed is gone"
    );
});
