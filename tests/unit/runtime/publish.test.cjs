"use strict";

/*
 * Publication: getting a finished PDF from the workspace to the name the user
 * will see.
 *
 * The fallbacks here are not hypothetical. A Shortcuts helper refused
 * /bin/mv with "Operation not permitted" on a file pdfcpu had just created in
 * the output folder, and refused /bin/rm as well, so the run failed and left
 * the partial behind. In the same folder, on the same run, a file the shell
 * itself created could be renamed freely.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { publishPdf } = require("../../../src/runtime/publish.js");
const { createFakeHost } = require("./fake-host.cjs");
const { makeJob } = require("./fake-job.cjs");

const DENIED = "Operation not permitted";

/*
 * The refusal as it was measured: what /bin/mv could not touch was the file
 * pdfcpu had created. Refusing every mv would also refuse the rename that
 * finishes a publication, which is not what the host did.
 */
const STAGED_MOVE = "mv' '-n' '/a/p.pdf'";

function refusing(...tools) {
    return tools.map((tool) => [tool, new Error(DENIED)]);
}

function commandsFor(host, tool) {
    return host.commands.filter((command) => command.includes(tool));
}

test("a rename stages the PDF and a link claims the name", () => {
    // The ordinary path: one volume, so nothing is copied, and the output
    // name is created in a single operation rather than written into.
    const host = createFakeHost({ files: ["/a/p.pdf"] });

    publishPdf(makeJob(host), "/a/p.pdf", "/a/out.pdf");

    assert.deepEqual([...host.files], ["/a/out.pdf"]);
    assert.equal(commandsFor(host, "/bin/cp").length, 0, "no copy was needed");
    assert.equal(commandsFor(host, "/bin/ln").length, 1, "the name was claimed");
});

test("a refused rename falls back to a copy, and the PDF is published", () => {
    // The reported failure. Creating files in the folder was permitted
    // throughout, so a copy reaches the folder the rename could not.
    const host = createFakeHost({
        files: ["/a/p.pdf"],
        failures: refusing(STAGED_MOVE)
    });

    publishPdf(makeJob(host), "/a/p.pdf", "/a/out.pdf");

    assert.ok(host.files.has("/a/out.pdf"), "the user must get their PDF");
    assert.equal(commandsFor(host, "/bin/cp").length, 1);
    assert.ok(!host.files.has("/a/p.pdf"), "and the copy it was made from is gone");
});

test("a host that cannot make links still publishes", () => {
    // FAT-formatted drives and some network shares refuse hard links. A
    // rename within one directory is atomic wherever it works at all.
    const host = createFakeHost({
        files: ["/a/p.pdf"],
        failures: refusing("/bin/ln")
    });

    publishPdf(makeJob(host), "/a/p.pdf", "/a/out.pdf");

    assert.deepEqual([...host.files], ["/a/out.pdf"]);
});

test("nothing of the run's is left behind, and a refused rm is survivable", () => {
    // The same host refused /bin/rm. The PDF is published either way, and
    // what is left over is a second name for it rather than a second copy.
    const cleaned = createFakeHost({ files: ["/a/p.pdf"] });

    publishPdf(makeJob(cleaned), "/a/p.pdf", "/a/out.pdf");
    assert.deepEqual([...cleaned.files], ["/a/out.pdf"]);

    const stubborn = createFakeHost({
        files: ["/a/p.pdf"],
        failures: refusing("/bin/rm")
    });

    assert.doesNotThrow(() => publishPdf(makeJob(stubborn), "/a/p.pdf", "/a/out.pdf"));
    assert.ok(stubborn.files.has("/a/out.pdf"));
});

test("publication announces itself before it starts, and again when it is done", () => {
    // The last thing a run does, and on a large PDF the longest wait in it.
    // A published PDF is also a unit of work that has finished, which is what
    // moves the count along.
    const host = createFakeHost({ files: ["/a/p.pdf"] });
    const job = makeJob(host);
    const said = [];

    job.progress = {
        beginning() {
            return undefined;
        },
        finished: (name) => said.push(`done: ${name}`),
        phase: (name) => said.push(name)
    };

    publishPdf(job, "/a/p.pdf", "/a/out.pdf");
    assert.deepEqual(said, ["Saving PDF", "done: Saved"]);
});
