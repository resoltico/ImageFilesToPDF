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
        "Finished with issues.\n1 PDF could not be saved where it was meant to go and was kept elsewhere; the location is below.\n\n1 recovered.\n\nSaved elsewhere:\n/Downloads/b.pdf\nThe requested destination was not used.");
    assert.equal(reportText(runOutcome([recovered, { ...recovered, recovery: "/Downloads/c.pdf" }])),
        "Finished with issues.\n2 PDFs could not be saved where they were meant to go and were kept elsewhere; the location is below.\n\n2 recovered.\n\nSaved elsewhere:\n/Downloads/b.pdf\nThe requested destination was not used.\n\n/Downloads/c.pdf\nThe requested destination was not used.");
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
    assert.equal(runOutcome([], [], [{ code: "operation", stage: "setup", message: "Missing tool." }]).state, "invalid");
});

test("expected setup refusal has its own literal headline and no conversion heading", () => {
    const result = failedRun(new OperationError("vipsheader could not read the built-in PNG image."));
    assert.equal(result.state, "invalid");
    assert.equal(reportText(result), "A required tool is missing or unusable.\n\nvipsheader could not read the built-in PNG image.");
    assert.equal(reportText(result, false), "vipsheader could not read the built-in PNG image.");
});

test("a stop with no output has one headline and no duplicate not-created sentence", () => {
    const stopped = { state: "canceled", sources: ["/stop.jpg"], pages: 0, issues: [] };
    const result = runOutcome([stopped, { ...stopped, state: "not-started" }]);
    assert.equal(reportText(result), "Stopped. No PDF was created.\n\n1 canceled; 1 not started.\n\nNot started: 1");
    const kept = runOutcome([recovered], [], [{ code: "canceled", stage: "publication" }]);
    assert.equal(reportText(kept), "Stopped.\n1 PDF could not be saved where it was meant to go and was kept elsewhere; the location is below.\n\n1 recovered.\n\nSaved elsewhere:\n/Downloads/b.pdf\nThe requested destination was not used.");
});

test("recovered paths have one plain cause and failed-only headings preserve other issues", () => {
    const primary = { code: "publication", stage: "publication", message: "Could not use the target.", diagnostic: { message: "  Permission  denied.\nRead only.  " } };
    const cleanup = { code: "cleanup", stage: "cleanup", message: "Temporary work was retained." };
    const kept = { ...recovered, recovery: "/Downloads/a  b.pdf", issues: [primary, cleanup] };
    const fault = { code: "fault", stage: "execution", message: "Run cleanup failed." };
    const text = reportText(runOutcome([kept, { ...saved, issues: [cleanup] }], [], [fault]));
    assert.ok(text.includes("Saved elsewhere:\n/Downloads/a  b.pdf\nPermission denied. Read only."));
    assert.doesNotMatch(text, /Could not convert:/u);
    assert.match(text, /Other issues:/u);
    assert.match(text, /Temporary work was retained/u); assert.match(text, /Run cleanup failed/u);
    const reasons = { ...recovered, issues: [{ code: "publication", stage: "publication", message: "Generic.", diagnostic: [" ", "Cross-device\nrename is unavailable."] }] };
    assert.match(reportText(runOutcome([reasons])), /Cross-device rename is unavailable\./u);
    const stopped = { ...recovered, issues: [{ code: "canceled", stage: "publication", message: "Stopped before saving." }, cleanup] };
    assert.match(reportText(runOutcome([stopped])), /Saved elsewhere:[\s\S]*Stopped before saving\./u);
    assert.match(reportText(runOutcome([stopped])), /Other issues:[\s\S]*Temporary work was retained/u);
});

test("recovery prefers the actual publication failure and keeps every other issue", () => {
    const { summarizeRun } = require("../../../src/core/run-summary.js");
    const cleanup = { code: "cleanup", stage: "cleanup", source: "/cleanup/owned.v", message: "Earlier cleanup failed." };
    const canceled = { code: "canceled", stage: "publication", message: "Stopped before publication." };
    const publication = { code: "publication", stage: "publication", message: "Generic publication failure.", diagnostic: { message: "Permission denied.\nCannot create output." } };
    const trailing = { code: "cleanup", stage: "cleanup", message: "Later cleanup failed." };
    const result = runOutcome([{ ...recovered, issues: [cleanup, canceled, publication, trailing] }], [], [{ code: "fault", stage: "cleanup", message: "Run-level problem." }]);
    assert.equal(summarizeRun(result).recoveries[0].cause, publication);
    assert.deepEqual(summarizeRun(result).failures, []);
    assert.equal(reportText({ ...result, elapsed: "2 seconds" }),
        "Stopped.\n1 PDF could not be saved where it was meant to go and was kept elsewhere; the location is below.\n\n1 recovered.\n\nSaved elsewhere:\n/Downloads/b.pdf\nPermission denied. Cannot create output.\n\nOther issues:\n/cleanup/owned.v: Earlier cleanup failed.\n/photos/b.jpg: Later cleanup failed.\nRun-level problem.\n\nElapsed: 2 seconds");
    const stopped = runOutcome([{ ...recovered, issues: [cleanup, canceled, trailing] }]);
    assert.equal(summarizeRun(stopped).recoveries[0].cause, canceled);
    assert.ok(reportText(stopped).includes("Saved elsewhere:\n/Downloads/b.pdf\nStopped before publication."));
});
