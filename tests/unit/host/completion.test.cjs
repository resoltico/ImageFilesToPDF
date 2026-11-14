"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { runOutcome } = require("../../../src/core/outcomes.js");
const { summarizeRun } = require("../../../src/core/run-summary.js");
const { showCompletion } = require("../../../src/host/quick-action/completion.js");
const { headline } = require("../../../src/core/run-report.js");

const saved = { state: "saved", sources: ["/a/one.png"], pages: 1, output: "/a/one.pdf", issues: [] };
const recovered = { state: "recovered", sources: ["/b/two.png"], pages: 1, recovery: "/Downloads/two.pdf", issues: [] };
const failed = { state: "failed", sources: ["/c/three.png"], pages: 0, issues: [{ code: "damaged", message: "damaged", diagnostic: { command: "vips copy" } }] };

function headlineOf(documents) {
    return headline(summarizeRun(runOutcome(documents)));
}

test("a recovered PDF is never reported as nothing created", () => {
    assert.equal(headlineOf([recovered]),
        "Finished with issues.\n1 PDF could not be saved where it was meant to go and was kept elsewhere; the location is below.");
    assert.equal(headlineOf([saved, recovered, { ...recovered, recovery: "/Downloads/four.pdf" }]),
        "Finished with issues.\nCreated 1 PDF. 2 PDFs could not be saved where they were meant to go and were kept elsewhere; the location is below.");
});

test("an incomplete run finishes with issues and a complete one only counts", () => {
    assert.equal(headlineOf([saved]), "Created 1 PDF.");
    assert.equal(headlineOf([failed]), "Finished with issues.\nNo PDF was created.");
    assert.equal(headlineOf([saved, { ...failed, state: "not-started", issues: [] }]), "Stopped. 1 PDF not created.\nCreated 1 PDF.");
});

// Paged dialogs stand in for the native alert: with no AppKit bridge, each answer is a button name.
function scriptedApp(answers) {
    const seen = [];
    return { seen, displayDialog(message, options) { seen.push({ message, options }); return { buttonReturned: answers.shift() }; } };
}

test("Show in Finder reveals every saved and recovered PDF", () => {
    const app = scriptedApp(["Show in Finder"]);
    const revealed = [];
    showCompletion(app, runOutcome([saved, recovered]), (paths) => revealed.push(paths));
    assert.deepEqual(revealed, [["/a/one.pdf", "/Downloads/two.pdf"]]);
    assert.ok(app.seen[0].options.buttons.includes("Show in Finder"), "fallback pagination retains the reveal action");
});

test("Show in Finder appears for saved PDFs alone and not when nothing exists", () => {
    const withSaved = scriptedApp(["OK"]);
    showCompletion(withSaved, runOutcome([saved]), () => assert.fail("OK must not reveal"));
    assert.deepEqual(withSaved.seen[0].options.buttons, ["Show in Finder", "OK"]);
    const none = scriptedApp(["OK"]);
    showCompletion(none, runOutcome([{ ...failed, issues: [{ code: "damaged", message: "damaged" }] }]));
    assert.deepEqual(none.seen[0].options.buttons, ["OK"]);
});

test("Details returns to the summary with Back until the summary is dismissed", () => {
    const app = scriptedApp(["Details", "Back", "Details", "Back", "Show in Finder"]);
    const revealed = [];
    showCompletion(app, runOutcome([saved, failed]), (paths) => revealed.push(paths));
    assert.equal(app.seen.length, 5);
    assert.deepEqual(app.seen[0].options.buttons, ["Show in Finder", "Details", "OK"]);
    assert.deepEqual(app.seen[1].options.buttons, ["Back"]);
    assert.match(app.seen[1].message, /^code: damaged$/mu);
    assert.match(app.seen[1].message, /command: vips copy/u);
    assert.deepEqual(app.seen[2].options.buttons, app.seen[0].options.buttons, "the summary comes back unchanged");
    assert.deepEqual(revealed, [["/a/one.pdf"]]);
});

test("OK on the summary after Details ends the run without revealing", () => {
    const app = scriptedApp(["Details", "Back", "OK"]);
    showCompletion(app, runOutcome([saved, failed]), () => assert.fail("OK must not reveal"));
    assert.equal(app.seen.length, 3);
});


test("unsupported-content loader evidence appears in completion Details", () => {
    const app = scriptedApp(["Details", "Back", "OK"]);
    const rejected = [{ path: "/a/misnamed.png", code: "unsupported-content", stage: "inspection",
        reason: "This file's content is not a supported still image; use JPEG, PNG, HEIC, TIFF, WebP or AVIF.", diagnostic: { loader: "gifload" } }];
    showCompletion(app, runOutcome([], rejected));
    assert.match(app.seen[1].message, /loader: gifload/u);
    assert.doesNotMatch(app.seen[0].message, /gifload/u);
});

test("a plain stop offers no empty technical Details", () => {
    const app = scriptedApp(["OK"]);
    const stopped = { state: "canceled", sources: ["/a.jpg"], pages: 0,
        issues: [{ code: "canceled", stage: "preparation", diagnostic: { command: "", stack: "private stack" } }] };
    showCompletion(app, runOutcome([stopped]));
    assert.deepEqual(app.seen[0].options.buttons, ["OK"]);
    assert.match(app.seen[0].message, /^Stopped\. No PDF was created\./u);
});

test("Details omits empty values and keeps meaningful zero and false values", () => {
    const app = scriptedApp(["Details", "Back", "OK"]);
    const issue = { code: "damaged", stage: "preparation", message: "Damaged.", diagnostic: {
        command: "", empty: null, spacing: " \r\n", stack: "private stack", attempt: 0, retriable: false, nested: { empty: "", value: "useful" }
    } };
    showCompletion(app, runOutcome([{ ...failed, issues: [issue] }]));
    const detail = app.seen[1].message;
    assert.match(detail, /attempt: 0/u); assert.match(detail, /retriable: false/u); assert.match(detail, /nested: value: useful/u);
    assert.doesNotMatch(detail, /command:|empty:|spacing:|private stack/u);
});
