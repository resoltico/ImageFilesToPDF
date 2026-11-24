"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { IssueError, OperationError, UserCanceled, causes } = require("../../../src/core/errors.js");
const { nativeEntryNames } = require("../../../src/host/directory-entry-names.js");
const { publishPdf } = require("../../../src/application/publish.js");
const { executeDocuments } = require("../../../src/application/documents.js");
const { fixture: documentFixture } = require("../application/document-fixture.cjs");
const { fixture, staged, target } = require("../ports/publication-fixture.cjs");
const { fakeDirectory } = require("../ports/fake-directory.cjs");

function closingReader(cause) {
    const sample = fakeDirectory([]);sample.control.closeCode = 5;sample.control.readFault = cause;
    const objc = { import: () => undefined, bindFunction: () => undefined, unwrap: (value) => value.boxed };
    return { read: nativeEntryNames(objc, sample.ns, sample.ref), events: sample.events };
}
function assertRetainedClaim({ app, job }, { location, lookups, reader }) {
    assert.equal(lookups.length, 1, "no reconfirmation or second document publication");
    assert.equal(reader.events.filter((event) => event === "close").length, 1);
    assert.ok(app.files.has(staged));assert.ok(app.files.has(lookups[0]), "the existing claim is never deleted");
    assert.equal(job.artifacts.get(staged).state, "validated");
    assert.equal(app.commands.filter((command) => command.includes("/bin/cp")).length, location === "private" ? 1 : 0);
}
for (const [label, makeCause, code] of [
    ["close only", () => null, "publication"],
    ["read operation", () => new OperationError("Read refused."), "publication"],
    ["read fault", () => new TypeError("Read bridge fault."), "fault"],
    ["read canceled", () => new UserCanceled(), "canceled"]
]) {
    test(`${label} plus mandatory close failure stops the actual executor without a second recovery`, () => {
        for (const location of ["public", "downloads", "private"]) {
            const cause = makeCause();
            const { app, job } = fixture();
            const { link } = job.publication, reader = closingReader(cause);
            let failure = null;
            const lookups = [];
            job.publication.link = (from, to) => location === "public" || (location === "downloads" && to.startsWith("/Downloads/")) ? link(from, to) : { state: "denied" };
            job.publication.actualPath = (path) => { lookups.push(path);return reader.read(path); };
            const sample = documentFixture(2, { mode: "separate", ports: { publish: () => {
                try { return publishPdf(job, staged, target); }
                catch (error) { failure = error;throw error; }
            } } });
            const records = executeDocuments(sample.ports, sample.plans);
            assert.equal(records[0].state, "recovered");assert.equal(records[0].recovery, staged);assert.equal(records[0].fatal, true);
            assert.equal(records[0].issues[0].code, code);assert.equal(records[1].state, "not-started");
            const cleanup = records[0].issues.filter((issue) => issue.code === "cleanup" && issue.stage === "cleanup");
            assert.equal(cleanup.length, 1);assert.match(cleanup[0].message, /closedir, errno 5/u);
            if (cause) {
                assert.ok(causes(failure).includes(cause));assert.equal(failure.stack, cause.stack);
                assert.equal(records[0].issues[0].diagnostic.stack, cause.stack);
            } else { assert.equal(failure.stack, cleanup[0].diagnostic.stack); }
            assertRetainedClaim({ app, job }, { location, lookups, reader });
        }
    });
}
test("mandatory close failure preserves an explicit unavailable original without inventing recovery", () => {
    const { app, job } = fixture();
    const { facts } = job.publication, reader = closingReader(null);
    let lookedUp = false;
    job.publication.actualPath = (path) => { lookedUp = true;return reader.read(path); };
    job.publication.facts = (path) => lookedUp && path === staged ? { identity: "", size: -1 } : facts(path);
    const sample = documentFixture(2, { mode: "separate", ports: { publish: () => publishPdf(job, staged, target) } });
    const records = executeDocuments(sample.ports, sample.plans);
    assert.equal(records[0].state, "failed");assert.equal(records[0].fatal, true);assert.equal(Object.hasOwn(records[0], "recovery"), false);
    assert.equal(records[0].issues[0].code, "fault");assert.ok(records[0].issues.some((issue) => issue.code === "cleanup" && issue.stage === "cleanup"));
    assert.equal(records[1].state, "not-started");assert.ok(app.files.has(staged));assert.ok(app.files.has(target));
    assert.equal(job.artifacts.get(staged).state, "validated");assert.equal(app.commands.some((command) => command.includes("/bin/cp")), false);
});

test("every underlying cleanup issue survives even when it precedes the read issue", () => {
    const prior = { code: "cleanup", stage: "cleanup", message: "An earlier owned read resource could not be closed." };
    const cause = new IssueError("Read refused after earlier cleanup failure.", { issues: [prior, { code: "operation", stage: "publication", message: "Read refused." }] });
    const { job } = fixture(), reader = closingReader(cause);
    job.publication.actualPath = (path) => reader.read(path);
    const sample = documentFixture(2, { mode: "separate", ports: { publish: () => publishPdf(job, staged, target) } });
    const records = executeDocuments(sample.ports, sample.plans);
    assert.equal(records[0].issues[0].code, "publication");assert.equal(records[0].fatal, true);assert.equal(records[1].state, "not-started");
    const cleanup = records[0].issues.filter((issue) => issue.code === "cleanup" && issue.stage === "cleanup");
    assert.equal(cleanup.length, 2);assert.equal(cleanup[0], prior);assert.match(cleanup[1].message, /closedir, errno 5/u);
});
