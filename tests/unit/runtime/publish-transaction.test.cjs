"use strict";

/*
 * Publication as one transaction.
 *
 * The output name is claimed, never written into: it is created in a single
 * operation that either succeeds or leaves the name alone. Everything before
 * that happens under a hidden name of this attempt's own, so an interruption
 * or a refusal can leave a half-finished file only where nobody will mistake
 * it for their document.
 *
 * This is why it matters that the file is not simply renamed to its final
 * name: across volumes Apple's mv copies to the pathname it was given, and an
 * interrupted move was measured leaving 3,211,264 bytes of a 1,258,291,200
 * byte file under exactly that name.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { publishPdf } = require("../../../src/runtime/publish.js");
const { createFakeHost } = require("./fake-host.cjs");
const { makeJob } = require("./fake-job.cjs");

const DENIED = "Operation not permitted";
const STAGED_MOVE = "mv' '-n' '/a/p.pdf'";

function partials(host) {
    return [...host.files].filter((file) => file.includes(".part"));
}

function commandsFor(host, tool) {
    return host.commands.filter((command) => command.includes(tool));
}

test("nothing is written to the output name; it is claimed in one step", () => {
    // Every operation before the claim names the staging file, which is
    // hidden, beside the destination, and this attempt's alone.
    const host = createFakeHost({ files: ["/a/p.pdf"] });

    publishPdf(makeJob(host), "/a/p.pdf", "/a/out.pdf");

    const writes = host.commands.filter((command) =>
        /'\/bin\/(?:mv|cp|ln)'/u.test(command) && command.includes("'/a/out.pdf'"));

    assert.deepEqual(writes.length, 1, writes.join("\n"));
    assert.match(writes[0], /^'\/bin\/ln' '\/a\/\.ImageFilesToPDF-[^']+\.part' '\/a\/out\.pdf'$/u);
});

test("the staging name is hidden, beside the destination, and this run's own", () => {
    const host = createFakeHost({
        files: ["/a/p.pdf"],
        failures: [[STAGED_MOVE, new Error(DENIED)]]
    });

    publishPdf(makeJob(host), "/a/p.pdf", "/a/out.pdf");

    assert.match(
        commandsFor(host, "/bin/cp")[0],
        /'\/a\/\.ImageFilesToPDF-[^']+\.part'/u
    );
    assert.deepEqual(partials(host), [], "and nothing of it is left");
});

test("both ways of taking the name say which one failed", () => {
    // Two operations can fail here and they fail for different reasons: the
    // link because the name is taken or unsupported, the rename because the
    // host refused it. A message naming neither leaves the person reading it
    // no better off.
    const host = createFakeHost({
        files: ["/a/p.pdf"],
        failures: [
            ["/bin/ln", new Error("ln: unsupported")],
            ["mv' '-n' '/a/.ImageFilesToPDF", new Error(DENIED)]
        ]
    });

    assert.throws(() => publishPdf(makeJob(host), "/a/p.pdf", "/a/out.pdf"), (error) => {
        assert.match(error.message, /claiming the output name/u);
        assert.match(error.message, /putting the PDF in place/u);

        return true;
    });
    assert.ok(!host.files.has("/a/out.pdf"), "and the name was never taken");
});

test("a copy that fails part way never wears the finished PDF's name", () => {
    // It did once: the copy went straight to the final name, so a copy that
    // stopped half way left an incomplete file called out.pdf. The run
    // reported the failure and kept the good copy elsewhere, and the user was
    // still left with something that looked like their document.
    const host = createFakeHost({
        files: ["/a/p.pdf"],
        failures: [
            [STAGED_MOVE, new Error(DENIED)],
            ["stat' '-f%z' '/a/.ImageFilesToPDF", "7"]
        ]
    });

    assert.throws(
        () => publishPdf(makeJob(host), "/a/p.pdf", "/a/out.pdf"),
        /7 bytes where 1024 were expected/u
    );
    assert.ok(!host.files.has("/a/out.pdf"), "the final name is untouched");
    assert.deepEqual(partials(host), [], "and the half-written copy is gone");
});

test("a name another run took is not overwritten, and the PDF is kept", () => {
    // The claim is what makes this safe rather than the check before it: two
    // runs can both find the name free and both go to publish it.
    const host = createFakeHost({ files: ["/a/p.pdf", "/a/theirs.pdf"] });
    const job = makeJob(host);

    host.sizes.set("/a/theirs.pdf", 99);

    assert.throws(
        () => publishPdf(job, "/a/p.pdf", "/a/theirs.pdf"),
        /could not be published/u
    );
    assert.equal(host.sizes.get("/a/theirs.pdf"), 99, "the other run's PDF is intact");
    assert.equal(
        [...host.files].filter((file) => file.includes("recovered")).length,
        1,
        "and ours is kept"
    );
});
