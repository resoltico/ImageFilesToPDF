"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { executeRun } = require("../../../src/application/run.js");
const { IssueError, UserCanceled, isUserCanceled } = require("../../../src/core/errors.js");
const { failedRun } = require("../../../src/core/outcomes.js");

function fixture() {
    const events = [];
    const settings = { mode: "combined" };
    const request = { invocation: { settings }, selection: { images: [{ path: "a", folder: "/a/" }], rejected: [] } };
    const result = { documents: [{ state: "saved", sources: ["a"], pages: 1, output: "/saved.pdf", issues: [] }], issues: [] };
    const ports = { progress: { diagnostics: [], pause: () => events.push("pause"), close: () => events.push("close") },
        prepare: () => request, createJob: () => ({}), convert: () => result,
        interaction: { settings: () => settings, present: (value) => value } };
    return { ports, events, settings, request, result };
}

test("controller presents authoritative outcomes after closing progress", () => {
    const { ports, request, result, events } = fixture();
    request.selection.rejected = [{ path: "bad" }];
    ports.progress.diagnostics = [{ code: "observer" }];
    ports.interaction.present = (value) => { events.push(value); return "presented"; };
    assert.equal(executeRun(ports), "presented");
    assert.deepEqual(events, ["pause", "close", { state: "incomplete", documents: result.documents,
        rejected: [{ path: "bad" }], issues: [], diagnostics: [{ code: "observer" }] }]);
    assert.equal(result.rejected, request.selection.rejected);
});

test("empty selection never asks settings or starts conversion", () => {
    const rejected = [{ path: "bad" }];
    const ports = { prepare: () => ({ selection: { images: [], rejected } }),
        interaction: { noImages(items) { assert.equal(items, rejected); return "empty"; } } };
    assert.equal(executeRun(ports), "empty");
});

test("the interaction receives core selection facts before the job is created", () => {
    const { ports, request, settings, events } = fixture();
    request.selection.rejected = [{ name: "bad", reason: "refused" }];
    ports.interaction.settings = (context, prepared) => {
        assert.equal(prepared, request);
        assert.deepEqual(context, { count: 1, selectedFolders: 0, folders: ["/a/"], rejected: request.selection.rejected, diagnostics: [] });
        events.push("settings"); return settings;
    };
    ports.createJob = (prepared, value) => { assert.equal(prepared, request); assert.equal(value, settings); events.push("job"); return {}; };
    executeRun(ports);
    assert.deepEqual(events, ["pause", "settings", "job", "close"]);
});

test("cancellation at the interaction boundary creates no job", () => {
    const { ports, events } = fixture();
    ports.interaction.settings = () => { events.push("settings"); throw new UserCanceled(); };
    ports.createJob = () => assert.fail("no job after cancellation");
    assert.throws(() => executeRun(ports), /User canceled/u);
    assert.deepEqual(events, ["pause", "settings"]);
});

for (const cause of [new TypeError("view failed"), new UserCanceled(), null, undefined]) {
    test(`presentation failure ${String(cause)} retains the confirmed outcome`, () => {
        const { ports, result } = fixture();
        // The presentation boundary can throw even a malformed value.
        ports.interaction.present = () => { throw cause; };
        assert.throws(() => executeRun(ports), (error) => {
            assert.equal(error.outcome, result);
            assert.equal(error.outcome.documents[0].output, "/saved.pdf");
            assert.equal(error.cause, cause);
            if (isUserCanceled(cause)) { assert.equal(failedRun(error, error.outcome), result); }
            else { assert.equal(failedRun(error, error.outcome).issues[0].stage, "reporting"); }
            return true;
        });
    });
}

for (const cause of [null, undefined, new TypeError("close fault")]) {
    test(`progress teardown failure ${String(cause)} retains the outcome without presenting`, () => {
        const { ports, result } = fixture();
        ports.progress.close = () => { throw cause; };
        ports.interaction.present = () => assert.fail("no presentation after failed teardown");
        assert.throws(() => executeRun(ports), (error) => error.outcome === result && failedRun(error, result).issues[0].stage === "reporting");
    });
}

test("unreadable presentation details cannot erase the confirmed outcome", () => {
    const { ports, result } = fixture();
    const failure = Object.defineProperty({}, "message", { get() { throw new TypeError("error getter"); } });
    ports.interaction.present = () => { throw failure; };
    assert.throws(() => executeRun(ports), (error) => error.outcome === result && error.message === "The failure details could not be read.");
});

test("presentation failure preserves diagnostic stack and reporting-fault classification", () => {
    const { ports } = fixture();
    const failure = new IssueError("transport", { issues: [{ code: "cleanup", stage: "cleanup", message: "transport", diagnostic: { stack: "native stack" } }] });
    ports.interaction.present = () => { throw failure; };
    assert.throws(() => executeRun(ports), (error) => {
        const [issue] = failedRun(error, error.outcome).issues;
        assert.equal(issue.code, "fault"); assert.equal(issue.stage, "reporting"); assert.equal(issue.diagnostic.stack, "native stack");
        return true;
    });
});
