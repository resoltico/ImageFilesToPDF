"use strict";

/*
 * What a publication that worked has to say for itself: nothing.
 *
 * reasons is what the failure message is built from, and both routes to the
 * output name carry one -- the long way round is taken because a link was
 * refused, and that refusal is worth reading only if the way round failed
 * too. A reason left on a successful outcome is a sentence shown to somebody
 * whose PDF is exactly where they asked for it.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { deliver } = require("../../../src/runtime/transfer.js");
const { stagingArea } = require("../../../src/runtime/staging-area.js");
const { fileFacts } = require("../../../src/runtime/file-facts.js");
const { createFakeHost } = require("./fake-host.cjs");

function publicationOf(host, staged, final) {
    return deliver(
        host,
        { staged, area: stagingArea(final), final },
        fileFacts(host, staged),
        host.renamer
    );
}

test("a link that published says nothing further", () => {
    const host = createFakeHost({ files: ["/a/p.pdf"] });
    const outcome = publicationOf(host, "/a/p.pdf", "/a/out.pdf");

    assert.equal(outcome.published, true);
    assert.equal(outcome.claimed, "/a/p.pdf", "the workspace file is the one at the name");
    assert.deepEqual(outcome.reasons, [], "the link said all there was to say");
});

test("a publication that went the long way round says nothing either", () => {
    const host = createFakeHost({
        files: ["/b/p.pdf"],
        failures: [["ln' '/b/p.pdf'", new Error("Cross-device link")]]
    });
    const outcome = publicationOf(host, "/b/p.pdf", "/b/out.pdf");

    assert.equal(outcome.published, true);
    assert.deepEqual(
        outcome.reasons,
        [],
        "why the link was refused is not a problem with the result"
    );
    assert.equal(
        outcome.claimed,
        outcome.staging.file,
        "and what was published is the copy that was renamed onto the name"
    );
});
