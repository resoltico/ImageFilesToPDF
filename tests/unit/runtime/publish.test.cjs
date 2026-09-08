"use strict";

/*
 * Publication: getting a finished PDF from the workspace to the name the user
 * will see.
 *
 * The fallbacks here are not hypothetical. A Shortcuts helper refused
 * /bin/mv with "Operation not permitted" on a file pdfcpu had just created in
 * the output folder, and refused /bin/rm as well, while copying in from the
 * workspace was allowed throughout.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { publishPdf } = require("../../../src/runtime/publish.js");
const { createFakeHost } = require("./fake-host.cjs");
const { makeJob } = require("./fake-job.cjs");

const DENIED = "Operation not permitted";

// The claim made from the workspace file itself, as against the one made from
// a staging copy: the two are told apart by what they link from.
const DIRECT_CLAIM = "ln' '/a/p.pdf'";

function refusing(...tools) {
    return tools.map((tool) => [tool, new Error(DENIED)]);
}

function commandsFor(host, tool) {
    return host.commands.filter((command) => command.includes(tool));
}

test("the workspace file is linked into place, and nothing is copied", () => {
    // The ordinary case: one volume, so the whole publication is one
    // operation and no file of ours ever appears in the folder under any
    // other name.
    const host = createFakeHost({ files: ["/a/p.pdf"] });

    publishPdf(makeJob(host), "/a/p.pdf", "/a/out.pdf");

    assert.deepEqual([...host.files], ["/a/out.pdf"]);
    assert.equal(commandsFor(host, "/bin/cp").length, 0, "no copy was needed");
    assert.equal(commandsFor(host, "/bin/ln").length, 1, "one claim");
});

test("an ordinary publication removes nothing but its own workspace copy", () => {
    // What may be removed is what this run made, and on the ordinary path it
    // made nothing in the output folder: the link is the publication.
    const host = createFakeHost({ files: ["/a/p.pdf"] });

    publishPdf(makeJob(host), "/a/p.pdf", "/a/out.pdf");

    assert.deepEqual(
        commandsFor(host, "/bin/rm"),
        ["'/bin/rm' '-f' '/a/p.pdf'"]
    );
});

test("a refused link falls back to a copy, and the PDF is published", () => {
    // Another volume, or a host that will not link out of the workspace.
    // Creating files in the folder was permitted throughout, so the PDF is
    // copied in and claimed from there.
    const host = createFakeHost({
        files: ["/a/p.pdf"],
        failures: refusing(DIRECT_CLAIM)
    });

    publishPdf(makeJob(host), "/a/p.pdf", "/a/out.pdf");

    assert.ok(host.files.has("/a/out.pdf"), "the user must get their PDF");
    assert.equal(commandsFor(host, "/bin/cp").length, 1);
    assert.deepEqual(
        [...host.files].filter((file) => file.includes(".ImageFilesToPDF")),
        [],
        "and the copy it was claimed from is gone"
    );
    assert.deepEqual(
        host.commands.filter((command) => (/'\/bin\/rm(?:dir)?'/u).test(command))
            .map((command) => command.split("' '")[0].replace(/'/gu, "")),
        ["/bin/rm", "/bin/rmdir", "/bin/rm"],
        "the copy, the place it was in, and the workspace copy"
    );
});

test("a filesystem that cannot make links at all still publishes", () => {
    // FAT and exFAT -- which is what a camera card is -- have no hard links
    // and no exclusive rename to reach from here, so the name is taken empty
    // and filled by one shell, which refuses a name that is already there.
    const host = createFakeHost({
        files: ["/a/p.pdf"],
        failures: refusing("/bin/ln")
    });

    publishPdf(makeJob(host), "/a/p.pdf", "/a/out.pdf");

    assert.ok(host.files.has("/a/out.pdf"));
    assert.deepEqual([...host.files].filter((file) => file.includes(".ImageFilesToPDF")), []);
    // The place this run made, and then the workspace copy. Removing the
    // copy inside it is a no-op here -- the rename took it -- and the place
    // is still this run's to clear away.
    assert.deepEqual(
        host.commands.filter((command) => (/'\/bin\/rm(?:dir)?'/u).test(command))
            .map((command) => command.split("' '")[0].replace(/'/gu, "")),
        ["/bin/rm", "/bin/rmdir", "/bin/rm"]
    );
});

test("the workspace copy goes only after the output path is checked", () => {
    const cleaned = createFakeHost({ files: ["/a/p.pdf"] });

    publishPdf(makeJob(cleaned), "/a/p.pdf", "/a/out.pdf");
    assert.deepEqual([...cleaned.files], ["/a/out.pdf"]);

    // The same host refused /bin/rm. The PDF is published either way, and
    // what is left over is a second name for it rather than a second copy.
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
