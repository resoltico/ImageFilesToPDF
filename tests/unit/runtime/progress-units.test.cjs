"use strict";

/*
 * What the counter counts, driven through the real conversion code.
 *
 * completedUnitCount holds work that has finished, so it must never pass the
 * total, must not reach it while there is work left, and must reach it when
 * there is not. A combined run counted only its images: preparing the last one
 * took the counter to the total before the PDF had been created, and
 * publishing it took the counter past the total -- 2 of 1 for a job of one
 * photograph.
 *
 * The separate-mode failures are the other half. Publication was the only
 * thing that advanced the count, so an image that failed on its way there was
 * never counted as attempted: three images with the second failing ended at
 * 2 of 3, three failures ended at 0 of 3, and the label said "3 of 3".
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { createProgress } = require("../../../src/runtime/progress.js");
const { unitsOf } = require("../../../src/runtime/job.js");
const { createCombinedPdf } = require("../../../src/runtime/pdf.js");
const {
    createSeparatePdfs
} = require("../../../src/runtime/pdf-separate.js");
const { createFakeHost } = require("./fake-host.cjs");
const { makeJob, imageOf } = require("./fake-job.cjs");

/*
 * What a run reports, in the order it reports it. `broken` names the images
 * vips will refuse to resize, which is how an image is made to fail without
 * taking the run with it.
 */
function run(mode, paths, broken = []) {
    const host = createFakeHost({
        files: paths,
        failures: broken.map((path) => [path, (command) => (
            command.includes("thumbnail")
                ? new Error("cannot resize this one")
                : undefined
        )])
    });
    const job = makeJob(host);
    const reports = [];

    job.settings.mode = mode;

    const units = unitsOf(job.settings, paths.length);

    job.progress = createProgress([{
        start() {
            return undefined;
        },
        report: (done, description, label) =>
            reports.push({ done, description, label })
    }]);
    job.progress.expect({ units, images: paths.length });

    const outcome = (mode === "separate" ? createSeparatePdfs : createCombinedPdf)(
        job,
        paths.map(imageOf)
    );

    return { units, reports, outcome };
}

test("a combined run counts the PDF it publishes as work of its own", () => {
    for (const count of [1, 3]) {
        const paths = Array.from({ length: count }, (ignored, at) => `/a/${at}.png`);
        const { units, reports } = run("single", paths);

        assert.equal(units, count + 1, `${count} images`);
        assert.ok(
            reports.every((entry) => entry.done <= units),
            `${count} images: the count must not pass the total`
        );
        assert.equal(
            reports.filter((entry) => entry.done === units).length,
            1,
            `${count} images: the total is reached once, at the end`
        );
        assert.equal(reports.at(-1).description, "Saved");
    }
});

test("the PDF is not counted as finished until it is saved", () => {
    // It used to be: the counter sat at its total through creation,
    // validation and saving, which is where the wait actually is.
    const { units, reports } = run("single", ["/a/1.png", "/a/2.png"]);
    const creating = reports.find((entry) => entry.description === "Creating PDF");

    assert.ok(creating.done < units, `${creating.done} of ${units} before creation`);
});

test("a combined run stops naming an image once the images are behind it", () => {
    const { reports } = run("single", ["/a/1.png", "/a/2.png"]);
    const creating = reports.find((entry) => entry.description === "Creating PDF");

    assert.equal(creating.label, "2 images prepared");
});

test("a separate run counts one unit for each PDF it publishes", () => {
    const paths = ["/a/1.png", "/a/2.png"];
    const { units, reports } = run("separate", paths);

    assert.equal(units, paths.length);
    assert.deepEqual(
        reports.filter((entry) => entry.description === "Saved").map((entry) => entry.done),
        [1, 2]
    );
    assert.ok(reports.every((entry) => entry.done <= units));
});

test("a separate run counts an image it could not convert", () => {
    // The audit's own table: whichever way each image goes, the run ends
    // having accounted for all three of them.
    const paths = ["/a/1.png", "/a/2.png", "/a/3.png"];
    const cases = [
        [[], 3, 0],
        [["/a/2.png"], 2, 1],
        [paths, 0, 3]
    ];

    for (const [broken, saved, failed] of cases) {
        const { units, reports, outcome } = run("separate", paths, broken);

        assert.equal(outcome.outputs.length, saved, `${broken.length} broken: saved`);
        assert.equal(outcome.failures.length, failed, `${broken.length} broken: failed`);
        assert.equal(
            reports.at(-1).done,
            units,
            `${broken.length} broken: every image is accounted for`
        );
        assert.equal(
            reports.filter((entry) => entry.description === "Failed").length,
            failed
        );
    }
});

test("the label counts images, whatever the units underneath it are", () => {
    // "1 of 2" in front of somebody waiting on a single photograph is
    // nonsense, whatever the counter it is drawn beside means.
    const { reports } = run("single", ["/a/only.png"]);

    assert.equal(reports[0].label, "1 of 1 — only.png");
});
