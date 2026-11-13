"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { reportText, describeNoImages, describeRejections } = require("../../../src/core/run-report.js");
const { runOutcome, failedRun } = require("../../../src/core/outcomes.js");
const { OperationError } = require("../../../src/core/errors.js");
const saved = { state: "saved", sources: ["/photos/a.jpg"], pages: 1, issues: [], output: "/photos/a.pdf" };
const recovered = { state: "recovered", sources: ["/photos/b.jpg"], pages: 1, issues: [], recovery: "/Downloads/b.pdf" };

test("saved, recovered and failed report sections are literal shared text", () => {
    assert.equal(reportText({ ...runOutcome([saved]), elapsed: "1 second" }),
        "Created 1 PDF.\n\n1 saved.\n\nSaved to:\n/photos/\na.pdf\n\nElapsed: 1 second");
    assert.equal(reportText(runOutcome([recovered])),
        "Finished with issues.\n1 PDF could not be saved where it was meant to go and was kept elsewhere; the location is below.\n\n1 recovered.\n\nRecovered PDFs:\n/Downloads/b.pdf");
    assert.equal(reportText(runOutcome([recovered, { ...recovered, recovery: "/Downloads/c.pdf" }])),
        "Finished with issues.\n2 PDFs could not be saved where they were meant to go and were kept elsewhere; the location is below.\n\n2 recovered.\n\nRecovered PDFs:\n/Downloads/b.pdf\n/Downloads/c.pdf");
    assert.equal(reportText(runOutcome([{ state: "failed", sources: ["/bad.jpg"], pages: 0, issues: [{ code: "damaged", message: "This image is damaged or incomplete." }] }])),
        "Finished with issues.\nNo PDF was created.\n\n1 failed.\n\nCould not convert:\n/bad.jpg: This image is damaged or incomplete.");
});

test("counts, folders and stop wording retain exact layout", () => {
    const result = runOutcome([saved, { ...saved, output: "/photos/c.pdf" }, { ...saved, output: "/other/d.pdf" },
        { state: "not-started", sources: ["/unstarted.jpg"], pages: 0, issues: [] },
        { state: "canceled", sources: ["/stopped.jpg"], pages: 0, issues: [] }]);
    assert.equal(reportText(result),
        "Stopped. 2 PDFs not created.\nCreated 3 PDFs.\n\n3 saved; 1 canceled; 1 not started.\n\nSaved to:\n/photos/\na.pdf\nc.pdf\n\n/other/\nd.pdf\n\nNot started: 1");
    assert.equal(reportText(runOutcome([saved]), false), "1 saved.\n\nSaved to:\n/photos/\na.pdf");
});

test("no-image and refusal wording covers both selection shapes", () => {
    assert.equal(describeNoImages([]), "No images selected.\n\nSelect image files or folders in Finder, then run the action again.\n\nSupported: JPEG, PNG, HEIC, TIFF, WebP or AVIF.");
    const rejected = [{ name: "bad.gif", path: "", reason: "Unsupported." }];
    assert.equal(describeNoImages(rejected), "Nothing to convert.\n\nNot included from your selection:\nbad.gif: Unsupported.");
    assert.equal(describeNoImages(rejected, false), "Not included from your selection:\nbad.gif: Unsupported.");
    assert.equal(describeRejections(rejected, "Refused:"), "Refused:\nbad.gif: Unsupported.");
});

test("core classifies pre-work request and settings errors as invalid", () => {
    for (const stage of ["request", "settings"]) {
        const issues = [{ code: "invalid", stage, message: "Correct the setting." }];
        const result = failedRun(new OperationError("Correct the setting.", { issues }));
        assert.equal(result.state, "invalid");
        assert.equal(reportText(result), "The request is invalid.\n\nCorrect the setting.");
        assert.equal(reportText(result, false), "Correct the setting.");
        assert.equal(runOutcome([saved], [], issues).state, "incomplete");
    }
    assert.equal(runOutcome([], [], [{ code: "operation", stage: "setup", message: "Missing tool." }]).state, "incomplete");
});
