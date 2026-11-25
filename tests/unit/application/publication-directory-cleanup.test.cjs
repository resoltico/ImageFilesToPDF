"use strict";
const { inspectModule } = require("../ports/inspect-module.cjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const { IssueError, OperationError, UserCanceled } = require("../../../src/core/errors.js");
const { causes } = inspectModule(require.resolve("../../../src/core/errors.js"), ["causes"]);
const { issuesOf } = require("../../../src/core/outcomes.js");
const { publishPdf } = require("../../../src/application/publish.js");
const { executeDocuments } = require("../../../src/application/documents.js");
const { fixture: documentFixture } = require("../application/fixture-documents.cjs");
const { fixture, staged, target } = require("../ports/publication-fixture.cjs");

function closingReader(cause) {
    const error = new OperationError("A name readback resource could not be closed.");
    const cleanup = { code: "cleanup", stage: "cleanup", message: error.message, diagnostic: { stack: error.stack } };
    const primary = cause ?? error;
    const failure = new IssueError(primary.message, { cause: primary, stack: primary.stack,
        issues: [...(cause ? issuesOf(cause, "publication") : []), cleanup] });
    return { read() { throw failure; } };
}
function assertRetainedClaim({ app, job }, { location, lookups }) {
    assert.equal(lookups.length, 1, "no reconfirmation or second document publication");
    assert.ok(app.files.has(staged));assert.ok(app.files.has(lookups[0]), "the existing claim is never deleted");
    assert.equal(job.artifacts.get(staged).state, "validated");
    assert.equal(app.events.filter(([event]) => event === "copyBeside").length, location === "staged-downloads" ? 1 : 0);
}
for (const [label, makeCause, code] of [
    ["close only", () => null, "publication"],
    ["read operation", () => new OperationError("Read refused."), "publication"],
    ["read fault", () => new TypeError("Read bridge fault."), "fault"],
    ["read canceled", () => new UserCanceled(), "canceled"]
]) {
    test(`${label} plus mandatory close failure stops the actual executor without a second recovery`, async () => {
        for (const location of ["public", "downloads", "staged-downloads"]) {
            const cause = makeCause();
            const { app, job } = fixture();
            const { link } = job.publication, reader = closingReader(cause);
            let failure = null;
            const lookups = [];
            job.publication.link = (from, to) => {
                if (location === "public") { return link(from, to); }
                if (!to.startsWith("/Downloads/")) { return { state: "denied" }; }
                return location === "staged-downloads" && from === staged ? { state: "cross-device" } : link(from, to);
            };
            job.publication.actualPath = (path) => { lookups.push(path);return reader.read(path); };
            const sample = documentFixture(2, { mode: "separate", ports: { publish: async () => {
                try { return (await publishPdf(job, staged, target)); }
                catch (error) { failure = error;throw error; }
            } } });
            const records = (await executeDocuments(sample.ports, sample.plans));
            assert.equal(records[0].state, "recovered");assert.equal(records[0].recovery, staged);assert.equal(records[0].fatal, true);
            assert.equal(records[0].issues[0].code, code);assert.equal(records[1].state, "not-started");
            const cleanup = records[0].issues.filter((issue) => issue.code === "cleanup" && issue.stage === "cleanup");
            assert.equal(cleanup.length, 1);assert.match(cleanup[0].message, /name readback resource could not be closed/u);
            if (cause) {
                assert.ok(causes(failure).includes(cause));assert.equal(failure.stack, cause.stack);
                assert.equal(records[0].issues[0].diagnostic.stack, cause.stack);
            } else { assert.equal(failure.stack, cleanup[0].diagnostic.stack); }
            assertRetainedClaim({ app, job }, { location, lookups });
        }
    });
}
test("mandatory close failure preserves an explicit unavailable original without inventing recovery", async () => {
    const { app, job } = fixture();
    const { facts } = job.publication, reader = closingReader(null);
    let lookedUp = false;
    job.publication.actualPath = (path) => { lookedUp = true;return reader.read(path); };
    job.publication.facts = (path) => lookedUp && path === staged ? { identity: "", size: -1 } : facts(path);
    const sample = documentFixture(2, { mode: "separate", ports: { publish: async () => (await publishPdf(job, staged, target)) } });
    const records = (await executeDocuments(sample.ports, sample.plans));
    assert.equal(records[0].state, "failed");assert.equal(records[0].fatal, true);assert.equal(Object.hasOwn(records[0], "recovery"), false);
    assert.equal(records[0].issues[0].code, "fault");assert.ok(records[0].issues.some((issue) => issue.code === "cleanup" && issue.stage === "cleanup"));
    assert.equal(records[1].state, "not-started");assert.ok(app.files.has(staged));assert.ok(app.files.has(target));
    assert.equal(job.artifacts.get(staged).state, "validated");assert.equal(app.events.some(([event]) => event === "copyBeside"), false);
});

test("every underlying cleanup issue survives even when it precedes the read issue", async () => {
    const prior = { code: "cleanup", stage: "cleanup", message: "An earlier owned read resource could not be closed." };
    const cause = new IssueError("Read refused after earlier cleanup failure.", { issues: [prior, { code: "operation", stage: "publication", message: "Read refused." }] });
    const { job } = fixture(), reader = closingReader(cause);
    job.publication.actualPath = (path) => reader.read(path);
    const sample = documentFixture(2, { mode: "separate", ports: { publish: async () => (await publishPdf(job, staged, target)) } });
    const records = (await executeDocuments(sample.ports, sample.plans));
    assert.equal(records[0].issues[0].code, "publication");assert.equal(records[0].fatal, true);assert.equal(records[1].state, "not-started");
    const cleanup = records[0].issues.filter((issue) => issue.code === "cleanup" && issue.stage === "cleanup");
    assert.equal(cleanup.length, 2);assert.equal(cleanup[0], prior);assert.match(cleanup[1].message, /name readback resource could not be closed/u);
});
