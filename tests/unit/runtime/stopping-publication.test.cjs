"use strict";

/*
 * A cancellation that arrives while the finished PDF is being published.
 *
 * Two earlier rounds let it through, on the grounds that the PDF is built and
 * validated and one operation from the person's folder, so stopping would
 * throw finished work away. That argument was about the PDF and missed what
 * the second route is: `deliver` copies beside the destination and claims
 * from there only because the link was judged impossible -- another volume, a
 * filesystem without hard links. A cancellation is not that judgement, and
 * taking the route anyway makes a directory in the person's folder and copies
 * the whole PDF into it after they said stop.
 *
 * Nothing of this run is at the destination when a link is cancelled. The
 * staged PDF is in the workspace, which the run removes on its way out.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { isUserCancelled } = require("../../../src/core/errors.js");
const { publishPdf } = require("../../../src/runtime/publish.js");
const { createFakeHost } = require("./fake-host.cjs");
const { makeJob } = require("./fake-job.cjs");

// A finished PDF in the workspace, which is what publishPdf is handed.
const STAGED = ["/a/staged.pdf"];

function cancellation() {
    const error = new Error("User cancelled.");

    error.errorNumber = -128;

    return error;
}

function shellSaying(files, decide) {
    const host = createFakeHost({ files, failures: [["", decide]] });

    return { host, job: makeJob(host) };
}

const cancelAt = (needle) => (command) =>
    (command.includes(needle) ? cancellation() : undefined);

function wroteInto(host, needle) {
    return host.commands.filter((command) =>
        command.includes(needle) && command.includes("/a/"));
}

// What is at a name the person would look at: not the finished PDF where it
// was built, which stays there until something claims it.
function publishedIn(host) {
    return [...host.files].filter((path) => path.startsWith("/a/") &&
        path.endsWith(".pdf") && !path.includes("staged"));
}

test("a cancelled claim starts no second way of making the name", () => {
    // The copy and the second link are a strategy, chosen because the first
    // one was judged impossible. Nothing judged anything here.
    const { host, job } = shellSaying(STAGED, cancelAt("/bin/ln"));

    assert.throws(
        () => publishPdf(job, "/a/staged.pdf", "/a/out.pdf"),
        isUserCancelled
    );
    assert.deepEqual(wroteInto(host, "/bin/mkdir"), [], "no place was made");
    assert.deepEqual(wroteInto(host, "/bin/cp"), [], "nothing was copied");
    assert.deepEqual(publishedIn(host), [], "and nothing was published");
});

test("a cancelled publication leaves nothing to recover", () => {
    // Which is what lets the workspace go. A refusal keeps the PDF because
    // the person needs it back; an abandonment has written nothing where they
    // would look for it.
    const { job } = shellSaying(STAGED, cancelAt("/bin/ln"));

    assert.throws(() => publishPdf(job, "/a/staged.pdf", "/a/out.pdf"));
    assert.equal(job.unpublished.size, 0);
});

test("a cancelled copy clears away the place it had made", () => {
    const { host, job } = shellSaying(STAGED, (command) => {
        if (command.includes("/bin/ln")) {
            return new Error("Operation not supported");
        }

        return command.includes("/bin/cp") ? cancellation() : undefined;
    });

    assert.throws(
        () => publishPdf(job, "/a/staged.pdf", "/a/out.pdf"),
        isUserCancelled
    );
    assert.ok(
        wroteInto(host, "/bin/rmdir").length > 0,
        `the staging place was closed: ${host.commands.join(" | ")}`
    );
    assert.deepEqual(publishedIn(host), []);
});

test("a cancelled second claim does not reach the exclusive rename", () => {
    // The rename is the other way of creating the name, and it is tried
    // because the link would not. A cancellation did not establish that.
    let links = 0;
    const { host, job } = shellSaying(STAGED, (command) => {
        if (!command.includes("/bin/ln")) {
            return undefined;
        }

        links += 1;

        return links === 1
            ? new Error("Operation not supported")
            : cancellation();
    });

    assert.throws(
        () => publishPdf(job, "/a/staged.pdf", "/a/out.pdf"),
        isUserCancelled
    );
    assert.deepEqual(publishedIn(host), [], "the rename never ran");
});
