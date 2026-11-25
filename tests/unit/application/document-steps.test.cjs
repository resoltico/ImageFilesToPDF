"use strict";

/*
 * The document executor's failure and cleanup steps, each driven directly.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { inspectModule } = require("../ports/inspect-module.cjs");

const { closePreparations, prepareGroup, prepareDocument, resolveValidationFailure, discardDisposable, handleDocumentFailure } =
    inspectModule(require.resolve("../../../src/application/documents.js"),
        ["closePreparations", "prepareGroup", "prepareDocument", "resolveValidationFailure", "discardDisposable", "handleDocumentFailure"]);

test("closing preparations reports failures as cleanup and skips slots never made", () => {
    assert.deepEqual(closePreparations([undefined]), []);
    const [issue] = closePreparations([{ close() { throw new Error("busy"); } }]);
    assert.deepEqual([issue.code, issue.stage, issue.message], ["cleanup", "cleanup", "busy"]);
});

test("a capture that throws before making a slot leaves nothing to close", async () => {
    const record = { pages: 0, issues: [] };
    const ports = { capturing: () => undefined, capture() { throw new Error("unreadable"); } };
    await assert.rejects(() => prepareGroup(ports, { record }, {}, [[0, { path: "/a.png" }]]), /unreadable/u);
    assert.deepEqual(record.issues, []);
});

test("sources are captured in groups of the parallelism, and no empty group follows", async () => {
    let groups = 0;
    const ports = { parallelism: 2, capturing() { groups += 1; }, capture: () => ({ ready: Promise.resolve({}), close: () => undefined }),
        beginning: () => undefined, prepare: () => Promise.resolve({}), prepared: () => undefined };
    await prepareDocument(ports, { sources: [{ path: "/a" }, { path: "/b" }] }, { record: { pages: 0, issues: [] } }, { add: () => Promise.resolve() });
    assert.equal(groups, 1);
});

test("an unconfirmed validation is recorded at the validation stage", () => {
    const record = { issues: [{ code: "fault" }] };
    resolveValidationFailure({ artifact: { state: "validating", path: "/w/a.pdf" }, record });
    assert.deepEqual([record.issues[1].code, record.issues[1].stage], ["fault", "validation"]);
});

test("a queue that cannot be cleared is a fatal cleanup issue", () => {
    const record = { issues: [] };
    discardDisposable({}, { record, artifact: null }, { clear() { throw new Error("stuck"); } });
    assert.deepEqual([record.issues[0].stage, record.fatal], ["cleanup", true]);
});

test("when reporting a failure fails, a saved document stays saved and others fail", () => {
    // The record refuses its first issue, so the ordinary failure report throws.
    function refusingOnce() {
        const issues = [];
        let refused = false;
        issues.push = (...items) => {
            if (!refused) { refused = true; throw new Error("full"); }
            return Array.prototype.push.apply(issues, items);
        };
        return issues;
    }
    for (const [state, expected] of [["saved", "saved"], ["building", "failed"]]) {
        const context = { record: { state, issues: refusingOnce() }, artifact: { path: "/w/a.pdf" }, stage: "publication" };
        handleDocumentFailure(context, new Error("publication failed"));
        assert.equal(context.record.state, expected, state);
        assert.equal(context.record.fatal, true);
        assert.equal(context.record.issues.at(-1).stage, "failure-reporting");
    }
});
