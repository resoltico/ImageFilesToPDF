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

const DENIED = "Operation not permitted";

function refusing(...tools) {
    return tools.map((tool) => [tool, new Error(DENIED)]);
}

function commandsFor(host, tool) {
    return host.commands.filter((command) => command.includes(tool));
}

test("an occupied destination is refused before anything is attempted", () => {
    const host = createFakeHost({ files: ["/a/p.pdf", "/a/out.pdf"] });

    assert.throws(
        () => publishPdf(host, "/a/p.pdf", "/a/out.pdf"),
        /became occupied before publication/u
    );
    assert.equal(commandsFor(host, "/bin/mv").length, 0);
    assert.equal(commandsFor(host, "/bin/cp").length, 0);
});

test("a rename publishes, and nothing is copied", () => {
    // The ordinary path: atomic, and no second write of the file.
    const host = createFakeHost({ files: ["/a/p.pdf"] });

    publishPdf(host, "/a/p.pdf", "/a/out.pdf");

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

    publishPdf(host, "/a/p.pdf", "/a/out.pdf");

    assert.ok(host.files.has("/a/out.pdf"), "the user must get their PDF");
    assert.equal(commandsFor(host, "/bin/cp").length, 1);
});

test("after a copy the partial is cleared, and a refused rm is survivable", () => {
    // The same host refused /bin/rm. The PDF is published either way.
    const cleaned = createFakeHost({
        files: ["/a/p.pdf"],
        failures: refusing("/bin/mv")
    });

    publishPdf(cleaned, "/a/p.pdf", "/a/out.pdf");
    assert.ok(!cleaned.files.has("/a/p.pdf"), "the partial is removed");

    const stubborn = createFakeHost({
        files: ["/a/p.pdf"],
        failures: refusing("/bin/mv", "/bin/rm")
    });

    assert.doesNotThrow(() => publishPdf(stubborn, "/a/p.pdf", "/a/out.pdf"));
    assert.ok(stubborn.files.has("/a/out.pdf"));
});
