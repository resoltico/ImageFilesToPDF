"use strict";

/*
 * Copying the PDF into the output folder, which happens when it cannot be
 * linked there from the workspace.
 *
 * What ends up under the staging name has to be this run's own file, because
 * the claim that follows publishes whatever is under it.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { publishPdf } = require("../../../src/runtime/publish.js");
const { copyBeside } = require("../../../src/runtime/output-copy.js");
const { createFakeHost } = require("./fake-host.cjs");
const { makeJob } = require("./fake-job.cjs");

const DIRECT_CLAIM = "ln' '/a/p.pdf'";
const STAGING_FACTS = "stat' '-f%d:%i:%z' '/a/.ImageFilesToPDF";
const INCOMING = "/a/.ImageFilesToPDF-test.part";

test("a name that is already taken is not borrowed", () => {
    // Adopting a file that happens to be under the staging name would publish
    // whatever bytes are in it -- and it would be removed afterwards as
    // though this run had made it.
    const host = createFakeHost({ files: ["/a/p.pdf", INCOMING] });
    const outcome = copyBeside(host, "/a/p.pdf", INCOMING, 1024);

    assert.equal(outcome.made, false, "so nothing of it is this run's to remove");
    assert.match(outcome.reasons[0], /the staging name was already taken/u);
    assert.equal(
        host.commands.filter((command) => command.includes("/bin/cp")).length,
        0
    );
});

test("a copy that failed still made whatever is under the name", () => {
    // cp leaves the destination in place after an error and can fail after
    // writing part of the file or all of it. From the moment it runs, the
    // name -- which was free -- is this attempt's to clear away.
    const host = createFakeHost({
        files: ["/a/p.pdf"],
        failures: [["/bin/cp", new Error("cp: no space left on device")]]
    });
    const outcome = copyBeside(host, "/a/p.pdf", INCOMING, 1024);

    assert.equal(outcome.made, true);
    assert.match(outcome.reasons[0], /no space left/u);
});

test("a copy is checked against the size it should have", () => {
    const host = createFakeHost({
        files: ["/a/p.pdf"],
        failures: [[`stat' '-f%d:%i:%z' '${INCOMING}'`, "16777232:5:7"]]
    });
    const outcome = copyBeside(host, "/a/p.pdf", INCOMING, 1024);

    assert.equal(outcome.made, true, "and it is still this run's to remove");
    assert.match(outcome.reasons[0], /7 bytes where 1024 were expected/u);
});

test("a source that could not be measured is never copied successfully", () => {
    // With no size to check against there is nothing to say the copy is
    // whole, so it cannot be treated as safely in the folder.
    const host = createFakeHost({ files: ["/a/p.pdf"] });
    const outcome = copyBeside(host, "/a/p.pdf", INCOMING, -1);

    assert.match(outcome.reasons[0], /-1 were expected/u);
});

test("neither file being measurable is not a match", () => {
    // Two unknown sizes are equal to each other. Without the explicit check
    // for an unknown expectation, a copy nobody could measure would pass.
    const host = createFakeHost({
        files: ["/a/p.pdf"],
        failures: [["/usr/bin/stat", new Error("stat: denied")]]
    });
    const outcome = copyBeside(host, "/a/p.pdf", INCOMING, -1);

    assert.deepEqual(outcome.reasons, ["the staged file is -1 bytes where -1 were expected"]);
});

test("a truncated copy never wears the finished PDF's name", () => {
    // The copy goes to a name of its own, so a copy that stopped half way
    // leaves nothing that looks like the finished document.
    const host = createFakeHost({
        files: ["/a/p.pdf"],
        failures: [
            [DIRECT_CLAIM, new Error("Operation not permitted")],
            [STAGING_FACTS, "16777232:5:7"]
        ]
    });

    assert.throws(
        () => publishPdf(makeJob(host), "/a/p.pdf", "/a/out.pdf"),
        /7 bytes where 1024 were expected/u
    );
    assert.ok(!host.files.has("/a/out.pdf"), "and nothing is at the output name");
    assert.deepEqual(
        [...host.files].filter((file) => file.includes(".part")),
        [],
        "and the half-written copy is gone"
    );
});
