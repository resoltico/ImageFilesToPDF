"use strict";

/*
 * Copying the PDF into the output folder, which happens when it cannot be
 * linked there from the workspace.
 *
 * It goes into a place this run made rather than a name this run found: mkdir
 * either creates the directory or fails, and it fails for anything already at
 * that name. So what is inside it is this attempt's, which is what makes
 * copying into it and clearing it away afterwards safe.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { publishPdf } = require("../../../src/runtime/publish.js");
const { copyBeside } = require("../../../src/runtime/output-copy.js");
const { createFakeHost } = require("./fake-host.cjs");
const { makeJob } = require("./fake-job.cjs");

const DIRECT_CLAIM = "ln' '/a/p.pdf'";
const STAGED_FACTS = "stat' '-f%d:%i:%z' '/a/.ImageFilesToPDF";
const AREA = {
    directory: "/a/.ImageFilesToPDF-test",
    file: "/a/.ImageFilesToPDF-test/ready.pdf"
};

test("a place that cannot be made is not one this run may clear away", () => {
    // Anything at all at that name -- a file, a folder, a link, a named pipe
    // -- and mkdir fails. Opening a name instead accepted a link pointing at
    // something that is not a regular file, and the run went on to record a
    // name it did not own.
    for (const settings of [
        { files: ["/a/p.pdf", AREA.directory] },
        { files: ["/a/p.pdf"], directories: [AREA.directory] },
        { files: ["/a/p.pdf"], danglingLinks: [AREA.directory] }
    ]) {
        const host = createFakeHost(settings);
        const outcome = copyBeside(host, "/a/p.pdf", AREA, 1024);

        assert.equal(outcome.made, false, "nothing of it is this run's");
        assert.match(outcome.reasons[0], /File exists/u);
        assert.match(
            outcome.reasons[0],
            /making a place for the PDF in the output folder/u,
            "and which step it was"
        );
        assert.equal(
            host.commands.filter((command) => command.includes("/bin/cp")).length,
            0,
            "and nothing was written into it"
        );
    }
});

test("a copy that failed still made the place it was going into", () => {
    // cp leaves the destination in place after an error and can fail after
    // writing part of the file or all of it. The place was made before it
    // ran, so it is this attempt's to clear away either way.
    const host = createFakeHost({
        files: ["/a/p.pdf"],
        failures: [["/bin/cp", new Error("cp: no space left on device")]]
    });
    const outcome = copyBeside(host, "/a/p.pdf", AREA, 1024);

    assert.equal(outcome.made, true);
    assert.match(outcome.reasons[0], /no space left/u);
});

test("a copy is checked against the size it should have", () => {
    const host = createFakeHost({
        files: ["/a/p.pdf"],
        failures: [[`stat' '-f%d:%i:%z' '${AREA.file}'`, "16777232:5:7"]]
    });
    const outcome = copyBeside(host, "/a/p.pdf", AREA, 1024);

    assert.equal(outcome.made, true, "and it is still this run's to clear away");
    assert.match(outcome.reasons[0], /7 bytes where 1024 were expected/u);
});

test("a source that could not be measured is never copied successfully", () => {
    const host = createFakeHost({ files: ["/a/p.pdf"] });
    const outcome = copyBeside(host, "/a/p.pdf", AREA, -1);

    assert.match(outcome.reasons[0], /-1 were expected/u);
});

test("neither file being measurable is not a match", () => {
    // Two unknown sizes are equal to each other. Without the explicit check
    // for an unknown expectation, a copy nobody could measure would pass.
    const host = createFakeHost({
        files: ["/a/p.pdf"],
        failures: [["/usr/bin/stat", new Error("stat: denied")]]
    });
    const outcome = copyBeside(host, "/a/p.pdf", AREA, -1);

    assert.deepEqual(outcome.reasons, ["the staged file is -1 bytes where -1 were expected"]);
});

test("a truncated copy never wears the finished PDF's name", () => {
    const host = createFakeHost({
        files: ["/a/p.pdf"],
        failures: [
            [DIRECT_CLAIM, new Error("Operation not permitted")],
            [STAGED_FACTS, "16777232:5:7"]
        ]
    });

    assert.throws(
        () => publishPdf(makeJob(host), "/a/p.pdf", "/a/out.pdf"),
        /7 bytes where 1024 were expected/u
    );
    assert.ok(!host.files.has("/a/out.pdf"), "and nothing is at the output name");
    assert.deepEqual(
        [...host.files].filter((file) => file.includes(".ImageFilesToPDF")),
        [],
        "and the place it was copied into is gone"
    );
});
