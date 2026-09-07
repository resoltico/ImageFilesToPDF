"use strict";

/*
 * The ways publication can fail, and how each is told apart from success.
 *
 * Neither mv -n nor cp -n reports declining: both exit zero and do nothing.
 * A copy is not atomic either, so a file at the destination is not evidence
 * that it holds our PDF. What the sizes say, and what is left under the
 * staging name, is what settles it.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { publishPdf } = require("../../../src/runtime/publish.js");
const { createFakeHost } = require("./fake-host.cjs");
const { makeJob } = require("./fake-job.cjs");

const DENIED = "Operation not permitted";
const DIRECT_CLAIM = "ln' '/a/p.pdf'";

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
        host.commands.filter((command) => command.includes("/bin/ln")).length,
        0,
        "nothing was attempted against the name"
    );
    assert.equal(job.unpublished.size, 0, "so the job no longer owns it");
    assert.deepEqual(
        host.commands.filter((command) => command.includes("/bin/rm")),
        [],
        "and nothing was removed, because nothing had been made"
    );
});

test("a link whose target is gone still occupies the name", () => {
    // -e follows the link and finds nothing, so the name reads as free while
    // something is plainly there: measured, mv replaces such a link without
    // complaint. The entry is what the output name is about.
    const host = createFakeHost({
        files: ["/a/p.pdf"],
        danglingLinks: ["/a/out.pdf"]
    });

    assert.throws(
        () => publishPdf(makeJob(host), "/a/p.pdf", "/a/out.pdf"),
        /became occupied before publication/u
    );
    // Setting the PDF aside uses mv too, so what matters is that nothing
    // was aimed at the name.
    assert.deepEqual(
        host.commands.filter((command) =>
            (/'\/bin\/(?:mv|cp|ln)'/u).test(command) && command.includes("'/a/out.pdf'")),
        [],
        "nothing was renamed or linked over it"
    );
});

test("when the PDF cannot be got into the folder at all, every refusal is named", () => {
    // The link message is what made the original failure diagnosable, and the
    // copy message is what says the fallback was tried.
    const host = createFakeHost({
        files: ["/a/p.pdf"],
        failures: refusing("/bin/ln", "/bin/cp")
    });

    assert.throws(() => publishPdf(makeJob(host), "/a/p.pdf", "/a/out.pdf"), (error) => {
        assert.match(error.message, /claiming the output name/u);
        assert.match(error.message, /copying the PDF into the output folder/u);

        return true;
    });
});

test("a failed publication keeps the finished PDF and says where", () => {
    // It has been imported and validated by this point. Deleting it destroys
    // completed work over a failure that has nothing to do with its contents.
    const host = createFakeHost({
        files: ["/a/p.pdf"],
        failures: refusing("/bin/ln", "/bin/cp")
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

test("a name holding something other than what was published is a failure", () => {
    // The check is which file is there, not whether some file is there: a
    // nonempty regular file at the output name is what another writer's PDF
    // looks like too.
    const host = createFakeHost({
        files: ["/a/p.pdf"],
        emptyFiles: ["/a/out.pdf"]
    });

    assert.throws(
        () => publishPdf(makeJob(host), "/a/p.pdf", "/a/out.pdf"),
        /does not hold the PDF this run published/u
    );
});

test("the failure reads as paragraphs, not as one run-on line", () => {
    // It goes in front of a person in a dialog, under a heading sentence.
    const host = createFakeHost({
        files: ["/a/p.pdf"],
        failures: refusing(DIRECT_CLAIM, "/bin/cp")
    });

    assert.throws(() => publishPdf(makeJob(host), "/a/p.pdf", "/a/out.pdf"), (error) => {
        assert.ok(error.message.startsWith(
            "The PDF could not be published without overwriting another file.\n\n"
        ), error.message);

        return true;
    });
});
