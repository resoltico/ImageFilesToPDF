"use strict";

/*
 * Where a stop takes effect.
 *
 * A cancellation arriving through a progress surface is recorded rather than
 * thrown on, because the place it arrives is wherever a report happened to be
 * made and that is no guide to whether stopping there is safe. So the run
 * asks, at the places where it is: before an image is started, once every
 * page is prepared, and once the PDF is built but not yet published.
 *
 * A stop recorded on the last image's own report used to reach none of those
 * -- the loop had no further image to ask about it -- so the run went on to
 * import, validate and publish a PDF it had already been told not to make.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { isUserCancelled } = require("../../../src/core/errors.js");
const { checkpoint } = require("../../../src/runtime/stopping.js");
const { createCombinedPdf } = require("../../../src/runtime/pdf.js");
const { createFakeHost } = require("./fake-host.cjs");
const { makeJob, imageOf } = require("./fake-job.cjs");

const TWO = ["/a/1.png", "/a/2.png"];

/*
 * A reporter that says stop the moment the given description is reported,
 * which is how a button pressed at one particular instant is modelled.
 */
function stoppingAt(description) {
    const said = [];
    let stopped = false;

    const note = (text) => {
        said.push(text);
        stopped ||= text === description;
    };

    return {
        said,
        stopped: () => stopped,
        expect: () => undefined,
        beginning: (index) => note(`beginning ${index}`),
        about: () => note("about"),
        phase: (text) => note(text),
        finished: (text) => note(`finished ${text}`),
        pause: () => undefined,
        close: () => undefined
    };
}

function combinedStoppedAt(description, files = TWO) {
    const host = createFakeHost({ files });
    const job = makeJob(host);

    job.progress = stoppingAt(description);

    const outcome = { host, said: job.progress.said, threw: null };

    try {
        createCombinedPdf(job, files.map(imageOf));
    } catch (error) {
        outcome.threw = error;
    }

    return outcome;
}

function pdfsIn(host) {
    return [...host.files].filter((path) => path.endsWith(".pdf"));
}

test("a checkpoint is a question, and only a stop answers it", () => {
    assert.doesNotThrow(() => checkpoint({ stopped: () => false }));
    assert.throws(() => checkpoint({ stopped: () => true }), isUserCancelled);
});

test("a stop on the last image's own report starts no PDF", () => {
    // Reproduced before it was fixed: the run went on through "Creating PDF",
    // "Validating PDF" and "Saving PDF" and published.
    const { host, said, threw } = combinedStoppedAt("finished Preparing");

    assert.ok(isUserCancelled(threw), "the run ends as a cancellation");
    assert.ok(!said.includes("Creating PDF"), `nothing was built: ${said.join(", ")}`);
    assert.deepEqual(pdfsIn(host), [], "and nothing was published");
});

test("a stop on one image's report begins no further image", () => {
    // The checkpoint at the top of the loop. Without it the run prepares
    // every remaining photograph before anything asks again.
    const { said, threw } = combinedStoppedAt("finished Preparing");

    assert.ok(isUserCancelled(threw));
    assert.ok(
        !said.includes("beginning 2"),
        `the second image was never started: ${said.join(", ")}`
    );
});

test("a stop on the last image's report is asked about after the loop", () => {
    // One image, so the loop has no further iteration to notice it in. This
    // is the checkpoint that exists because the loop cannot be the only one.
    const { said, threw } = combinedStoppedAt("finished Preparing", ["/a/only.png"]);

    assert.ok(isUserCancelled(threw));
    assert.ok(
        !said.includes("Creating PDF"),
        `no import was started: ${said.join(", ")}`
    );
    assert.ok(!said.includes("about"), "and nothing was summarised");
});

test("a stop while the PDF is being built publishes nothing", () => {
    const { host, said, threw } = combinedStoppedAt("Creating PDF");

    assert.ok(isUserCancelled(threw));
    assert.ok(!said.includes("Saving PDF"), `publication never began: ${said.join(", ")}`);
    assert.deepEqual(pdfsIn(host), []);
});

test("a stop while the PDF is being validated publishes nothing", () => {
    const { host, threw } = combinedStoppedAt("Validating PDF");

    assert.ok(isUserCancelled(threw));
    assert.deepEqual(pdfsIn(host), []);
});

test("a stop once publication has started lets it finish", () => {
    // There is no checkpoint inside a publication. It owns a finished PDF and
    // a name it has claimed, and unwinding it from an unrelated signal is how
    // both are lost.
    const { host, said, threw } = combinedStoppedAt("Saving PDF");

    assert.equal(threw, null, "the run completes");
    assert.ok(said.includes("finished Saved"));
    assert.equal(pdfsIn(host).length, 1, "the PDF it had already claimed is there");
});

test("a run nobody stops is untouched by any of this", () => {
    const { host, threw } = combinedStoppedAt("never said");

    assert.equal(threw, null);
    assert.equal(pdfsIn(host).length, 1);
});
