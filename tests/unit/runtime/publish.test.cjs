"use strict";

/*
 * Publication: getting a finished PDF from its partial name to its final one.
 *
 * The fallback here is not hypothetical. A Shortcuts helper refused /bin/mv
 * with "Operation not permitted" on a file pdfcpu had just created in the
 * same folder, and refused /bin/rm as well, so the run failed and left the
 * partial behind.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { publishPdf } = require("../../../src/runtime/publish.js");
const { createFakeHost } = require("./fake-host.cjs");
const { makeJob } = require("./fake-job.cjs");

const DENIED = "Operation not permitted";

function refusing(...tools) {
    return tools.map((tool) => [tool, new Error(DENIED)]);
}

function commandsFor(host, tool) {
    return host.commands.filter((command) => command.includes(tool));
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
    assert.equal(commandsFor(host, "/bin/cp").length, 0, "nothing was copied");
    assert.ok(!host.files.has("/a/p.pdf"), "it is not where it was built");
    assert.equal(
        [...host.files].filter((file) => file.includes("recovered")).length,
        1,
        "it is in a recovery folder"
    );
    assert.equal(job.unpublished.size, 0, "so the job no longer owns it");
});

test("a PDF that could not even be set aside keeps its workspace", () => {
    // Set aside is best effort. When it fails the file is still where it was
    // built, and the workspace it was built in has to outlive the run.
    const denied = new Error("Operation not permitted");
    const host = createFakeHost({
        files: ["/a/p.pdf", "/a/out.pdf"],
        failures: [["mktemp", denied]]
    });
    const job = makeJob(host);

    assert.throws(() => publishPdf(job, "/a/p.pdf", "/a/out.pdf"), (error) => {
        assert.match(error.message, /kept here:\n\n\/a\/p\.pdf/u);

        return true;
    });
    assert.deepEqual([...job.unpublished], ["/a/p.pdf"]);
});

test("a rename publishes, and nothing is copied", () => {
    // The ordinary path: atomic, and no second write of the file.
    const host = createFakeHost({ files: ["/a/p.pdf"] });

    publishPdf(makeJob(host), "/a/p.pdf", "/a/out.pdf");

    assert.deepEqual([...host.files], ["/a/out.pdf"]);
    assert.match(commandsFor(host, "/bin/mv")[0], /'-n'/u);
    assert.equal(commandsFor(host, "/bin/cp").length, 0, "no copy was needed");
});

test("a refused rename falls back to a copy, and the PDF is published", () => {
    // The reported failure. Creating files in the folder was permitted
    // throughout, so a copy reaches the destination the rename could not.
    const host = createFakeHost({
        files: ["/a/p.pdf"],
        failures: refusing("/bin/mv")
    });

    publishPdf(makeJob(host), "/a/p.pdf", "/a/out.pdf");

    assert.ok(host.files.has("/a/out.pdf"), "the user must get their PDF");
    assert.equal(commandsFor(host, "/bin/cp").length, 1);
});

test("after a copy the partial is cleared, and a refused rm is survivable", () => {
    // The same host refused /bin/rm. The PDF is published either way.
    const cleaned = createFakeHost({
        files: ["/a/p.pdf"],
        failures: refusing("/bin/mv")
    });

    publishPdf(makeJob(cleaned), "/a/p.pdf", "/a/out.pdf");
    assert.ok(!cleaned.files.has("/a/p.pdf"), "the partial is removed");

    const stubborn = createFakeHost({
        files: ["/a/p.pdf"],
        failures: refusing("/bin/mv", "/bin/rm")
    });

    assert.doesNotThrow(() => publishPdf(makeJob(stubborn), "/a/p.pdf", "/a/out.pdf"));
    assert.ok(stubborn.files.has("/a/out.pdf"));
});

test("publication announces itself before it starts", () => {
    // The last thing a run does, and on a large PDF the longest wait in it.
    const host = createFakeHost({ files: ["/a/p.pdf"] });
    const job = makeJob(host);
    const said = [];

    job.progress = {
        file() {
            return undefined;
        },
        phase: (name) => said.push(name)
    };

    publishPdf(job, "/a/p.pdf", "/a/out.pdf");
    assert.deepEqual(said, ["Saving PDF"]);
});
