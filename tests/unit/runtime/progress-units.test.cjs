"use strict";

/*
 * What the counter counts.
 *
 * completedUnitCount holds work that has finished, so it must never pass the
 * total and must not reach it while there is work left. A combined run
 * counted only its images: preparing the last one took the counter to the
 * total before the PDF had been created, and publishing it took the counter
 * past the total -- 2 of 1 for a job of one photograph.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { createProgress, unitsOf } = require("../../../src/runtime/progress.js");
const {
    createCombinedPdf,
    createSeparatePdfs
} = require("../../../src/runtime/pdf.js");
const { createFakeHost } = require("./fake-host.cjs");
const { makeJob, imageOf } = require("./fake-job.cjs");

// What a run reports, in the order it reports it.
function run(mode, paths) {
    const host = createFakeHost({ files: paths });
    const job = makeJob(host);
    const reports = [];

    job.settings.mode = mode;

    const units = unitsOf(job.settings, paths.length);

    job.progress = createProgress({ units, images: paths.length }, {
        start() {
            return undefined;
        },
        report: (done, description, label) => reports.push({ done, description, label })
    });

    (mode === "separate" ? createSeparatePdfs : createCombinedPdf)(
        job,
        paths.map(imageOf)
    );

    return { units, reports };
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

test("the label counts images, whatever the units underneath it are", () => {
    // "1 of 2" in front of somebody waiting on a single photograph is
    // nonsense, whatever the counter it is drawn beside means.
    const { reports } = run("single", ["/a/only.png"]);

    assert.equal(reports[0].label, "1 of 1 — only.png");
});
