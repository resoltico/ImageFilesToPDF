"use strict";

/*
 * The ways publication can fail, and how each is told apart from success.
 *
 * Neither mv -n nor cp -n reports declining: both exit zero and do nothing.
 * A copy is not atomic either, so a destination that exists is not evidence
 * that it holds our PDF. Size is what settles it.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    fileSize,
    copyInto,
    publishPdf
} = require("../../../src/runtime/publish.js");
const { createFakeHost } = require("./fake-host.cjs");

const DENIED = "Operation not permitted";

function refusing(...tools) {
    return tools.map((tool) => [tool, new Error(DENIED)]);
}

test("a copy that declined because the name was taken is not a publication", () => {
    // cp -n exits zero when it declines, leaving a file that is not ours at
    // the destination. Existence therefore proves nothing, and only the size
    // gives it away. Reached directly, because publishPdf refuses an occupied
    // destination before it gets this far.
    const host = createFakeHost({ files: ["/a/p.pdf", "/a/out.pdf"] });

    host.sizes.set("/a/out.pdf", 99);

    const outcome = copyInto(host, "/a/p.pdf", "/a/out.pdf");

    assert.equal(outcome.published, false);
    assert.match(outcome.reason, /99 bytes where 1024 were expected/u);
});

test("a truncated copy is a failure, not a publication", () => {
    // A copy is not atomic, so the destination existing proves nothing. Size
    // is what distinguishes a finished copy from an interrupted one.
    const host = createFakeHost({
        files: ["/a/p.pdf"],
        // Only the destination measures short, as a half-written file would.
        failures: [
            ["/bin/mv", new Error(DENIED)],
            ["stat' '-f%z' '/a/out.pdf'", "7"]
        ]
    });

    assert.throws(
        () => publishPdf(host, "/a/p.pdf", "/a/out.pdf"),
        /could not be published/u
    );
});

test("when both ways are refused, the error says what each said", () => {
    // The mv message is what made the original failure diagnosable at all.
    const host = createFakeHost({
        files: ["/a/p.pdf"],
        failures: refusing("/bin/mv", "/bin/cp")
    });

    assert.throws(() => publishPdf(host, "/a/p.pdf", "/a/out.pdf"), (error) => {
        assert.match(error.message, /could not be published/u);
        assert.match(error.message, /publishing PDF/u);
        assert.match(error.message, /copying the PDF into place/u);

        return true;
    });
});

test("a failed publication keeps the finished PDF and says where", () => {
    // It has been imported and validated by this point. Deleting it destroys
    // completed work over a failure that has nothing to do with its contents.
    const host = createFakeHost({
        files: ["/a/p.pdf"],
        failures: refusing("/bin/mv", "/bin/cp")
    });

    assert.throws(() => publishPdf(host, "/a/p.pdf", "/a/out.pdf"), (error) => {
        assert.match(error.message, /The finished PDF has been kept here:/u);
        assert.match(error.message, /\/a\/p\.pdf/u);

        return true;
    });
    assert.ok(host.files.has("/a/p.pdf"), "the finished PDF must survive");
});

test("a published file that is empty is still a failure", () => {
    const host = createFakeHost({
        files: ["/a/p.pdf"],
        emptyFiles: ["/a/out.pdf"]
    });

    assert.throws(
        () => publishPdf(host, "/a/p.pdf", "/a/out.pdf"),
        /output PDF was not written or is empty/u
    );
});

test("an unmeasurable file reports no size rather than a plausible one", () => {
    // A size that cannot be read must not compare equal to anything.
    const host = createFakeHost({ files: [] });

    assert.equal(fileSize(host, "/a/missing.pdf"), -1);
});
