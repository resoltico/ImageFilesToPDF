"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { publishPdf } = require("../../../src/application/publish.js");
const { OperationError, UserCanceled } = require("../../../src/core/errors.js");
const { fixture, staged, target } = require("../ports/publication-fixture.cjs");

test("a claimed PDF with an unverifiable name preserves the validated original without another recovery", async () => {
    for (const copied of [false, true]) {
        const { app, job } = fixture();
        const { link } = job.publication;
        let claims = 0;
        job.publication.link = (from, to) => { claims += 1; return copied && claims === 1 ? { state: "cross-device" } : link(from, to); };
        job.publication.actualPath = () => { throw new OperationError("Canonical name unavailable."); };
        // eslint-disable-next-line no-await-in-loop -- Settle and inspect this fixture before the next case.
        await assert.rejects(() => publishPdf(job, staged, target), (error) => {
            assert.equal(error.recovery, staged);
            assert.equal(error.issues[0].code, "publication");
            assert.match(error.issues[0].message, /finished copy was created.*stored filename.*validated original was retained/u);
            assert.equal(error.issues[0].diagnostic.folder, "/out/");
            assert.equal(Object.hasOwn(error.issues[0].diagnostic, "path"), false, "no guessed public output path");
            return true;
        });
        assert.ok(app.files.has(staged)); assert.ok(app.files.has(target));
        assert.equal(job.artifacts.get(staged).state, "validated");
        assert.equal([...app.files.keys()].some((path) => path.startsWith("/Downloads/")), false);
        assert.equal(app.commands.some((command) => command.includes("ImageFilesToPDF-recovered")), false);
    }
});

test("unverifiable Downloads names do not delete or duplicate their validated originals", async () => {
    for (const copied of [false, true]) {
        const { app, job } = fixture();
        const { link } = job.publication;
        job.publication.link = (from, to) => {
            if (!to.startsWith("/Downloads/")) { return { state: "denied" }; }
            return copied && from === staged ? { state: "cross-device" } : link(from, to);
        };
        job.publication.actualPath = () => { throw new OperationError("Canonical recovery name unavailable."); };
        // eslint-disable-next-line no-await-in-loop -- Settle and inspect this fixture before the next case.
        await assert.rejects(() => publishPdf(job, staged, target), (error) => error.recovery === staged);
        assert.ok(app.files.has(staged)); assert.equal(job.artifacts.get(staged).state, "validated");
        const claims = [...app.files.keys()].filter((path) => path === "/Downloads/result.pdf");
        assert.equal(claims.length, 1, "one claimed copy is left untouched; no duplicate fallback");
        assert.equal(app.events.filter(([event]) => event === "copyBeside").length, copied ? 1 : 0);
    }
});

test("publication results use the authoritative stored path instead of the intended candidate", async () => {
    const { app, job } = fixture();
    const actual = "/out/résult.pdf";
    job.publication.actualPath = (path, expected) => {
        assert.equal(path, target); assert.deepEqual(expected, app.publication.facts(path));
        app.files.set(actual, { ...job.publication.facts(path) });
        return actual;
    };
    assert.equal((await publishPdf(job, staged, target)).path, actual);
    assert.ok(!app.files.has(staged));
});


test("changed, missing or uninspectable originals cannot enter generic recovery after a claim", async () => {
    for (const observation of [{ identity: "9:9", size: 4096 }, { identity: "", size: -1 }, null]) {
        const { app, job } = fixture();
        const { facts } = job.publication;
        let changed = false;
        job.publication.actualPath = () => { changed = true; throw new OperationError("Name unavailable after claim."); };
        job.publication.facts = (path) => {
            if (changed && path === staged) {
                if (observation === null) { throw new Error("Original inspection denied."); }
                return observation;
            }
            return facts(path);
        };
        // eslint-disable-next-line no-await-in-loop -- Settle and inspect this fixture before the next case.
        await assert.rejects(() => publishPdf(job, staged, target), (error) => {
            assert.equal(error.recovery, null); assert.equal(error.issues[0].code, "fault");
            assert.deepEqual(error.issues[0].diagnostic.observed, observation ?? { error: "Original inspection denied." });
            assert.equal(error.issues[0].diagnostic.folder, "/out/");
            assert.match(error.issues[0].message, /A finished copy was created.*no trustworthy recovery path/u);
            return true;
        });
        assert.ok(app.files.has(staged)); assert.ok(app.files.has(target));
        assert.equal(job.artifacts.get(staged).state, "validated");
        assert.equal(app.commands.some((command) => /keeping the validated|ImageFilesToPDF-recovered|\/bin\/cp/u.test(command)), false);
        assert.equal([...app.files.keys()].some((path) => path.startsWith("/Downloads/")), false);
    }
});


test("the actual publication refusal with no verified original produces failed application output without a recovery path", async () => {
    const { executeDocuments } = require("../../../src/application/documents.js");
    const { fixture: documentFixture } = require("../application/fixture-documents.cjs");
    const { job } = fixture();
    const { facts } = job.publication;
    let changed = false;
    job.publication.actualPath = () => { changed = true; throw new OperationError("Name query refused."); };
    job.publication.facts = (path) => changed && path === staged ? { identity: "", size: -1 } : facts(path);
    const sample = documentFixture(2, { mode: "separate", ports: { publish: async () => (await publishPdf(job, staged, target)) } });
    const records = (await executeDocuments(sample.ports, sample.plans));
    assert.equal(records[0].state, "failed"); assert.equal(records[0].fatal, true);
    assert.equal(records[0].issues[0].code, "fault"); assert.equal(Object.hasOwn(records[0], "recovery"), false);
    assert.equal(records[1].state, "not-started"); assert.equal(job.artifacts.get(staged).state, "validated");
});


test("initial original inspection refusal carries no invented recovery path", async () => {
    const { app, job } = fixture();
    const cause = new Error("Original attributes unavailable.");
    job.publication.facts = () => { throw cause; };
    await assert.rejects(() => publishPdf(job, staged, target), (error) => error.recovery === null && error.cause === cause && error.issues[0].code === "fault");
    assert.ok(app.files.has(staged)); assert.ok(!app.files.has(target));
    assert.equal(app.commands.length, 0);
});

test("a changed original is refused before destination-stage copying", async () => {
    const { app, job } = fixture();
    const { facts } = job.publication;
    let changed = false;
    job.publication.link = () => { changed = true; return { state: "cross-device" }; };
    job.publication.facts = (path) => changed && path === staged ? { identity: "1:99", size: facts(path).size } : facts(path);
    await assert.rejects(() => publishPdf(job, staged, target), (error) => error.recovery === null && error.issues[0].code === "fault");
    assert.equal(app.events.some(([event]) => event === "copyBeside"), false);
    assert.ok(app.files.has(staged)); assert.ok(!app.files.has(target));
});

test("same-size original replacement during destination copying cannot publish or delete either candidate", async () => {
    const { app, job } = fixture();
    const { copyBeside } = job.operations, read = job.publication.facts;
    const original = read(staged);
    let changed = false, claims = 0;
    job.publication.link = () => { claims += 1; return { state: "cross-device" }; };
    job.operations.copyBeside = (from, to) => { copyBeside(from, to); changed = true; };
    job.publication.facts = (path) => changed && path === staged ? { identity: "9:9", size: original.size } : read(path);
    await assert.rejects(() => publishPdf(job, staged, target), (error) => {
        assert.equal(error.recovery, null); assert.equal(error.issues[0].code, "fault");
        assert.match(error.issues[0].diagnostic.candidate.folder, /^\/out\/\.ImageFilesToPDF-/u);
        assert.ok(error.issues[0].diagnostic.candidate.identity); return true;
    });
    assert.equal(claims, 1); assert.ok(!app.files.has(target)); assert.ok(app.files.has(staged));
    assert.equal([...app.files.keys()].filter((path) => path.endsWith("/ready.pdf") && path !== staged).length, 1);
    assert.equal(job.artifacts.get(staged).state, "validated");
});

test("confirmed public output survives original replacement during name lookup with a fatal cleanup issue", async () => {
    const { executeDocuments } = require("../../../src/application/documents.js");
    const { fixture: documentFixture } = require("../application/fixture-documents.cjs");
    const { app, job } = fixture();
    const read = job.publication.facts;
    const original = read(staged);
    let changed = false;
    job.publication.actualPath = (path) => { changed = true; return path; };
    job.publication.facts = (path) => changed && path === staged ? { identity: "9:9", size: original.size } : read(path);
    const sample = documentFixture(2, { mode: "separate", ports: { publish: async () => (await publishPdf(job, staged, target)) } });
    const records = (await executeDocuments(sample.ports, sample.plans));
    assert.equal(records[0].state, "saved"); assert.equal(records[0].output, target); assert.equal(records[0].fatal, true);
    assert.equal(records[0].issues[0].code, "fault"); assert.equal(records[0].issues[0].stage, "cleanup");
    assert.equal(records[0].issues[0].message, "The original PDF could not be verified and was not removed.");
    assert.deepEqual(records[0].issues[0].diagnostic.candidate, { path: target, identity: original.identity, size: original.size });
    assert.equal(records[1].state, "not-started");
    assert.ok(app.files.has(staged)); assert.ok(app.files.has(target)); assert.equal(job.artifacts.get(staged).state, "validated");
    assert.equal(app.events.some(([event, path]) => event === "removeFile" && path === staged), false);
});

test("original replacement before Downloads release preserves its named candidate without claiming recovery", async () => {
    const { app, job } = fixture();
    const { link } = job.publication;
    const read = job.publication.facts;
    const original = read(staged);
    let changed = false;
    job.publication.link = (from, to) => to.startsWith("/Downloads/") ? link(from, to) : { state: "denied" };
    job.publication.actualPath = (path) => { changed = true; return path; };
    job.publication.facts = (path) => changed && path === staged ? { identity: "9:9", size: original.size } : read(path);
    await assert.rejects(() => publishPdf(job, staged, target), (error) => {
        assert.equal(error.recovery, null); assert.equal(error.issues[0].diagnostic.candidate.path, "/Downloads/result.pdf"); return true;
    });
    assert.ok(app.files.has(staged)); assert.ok(app.files.has("/Downloads/result.pdf"));
    assert.equal(job.artifacts.get(staged).state, "validated");
});


test("the human recovery report keeps creation/name uncertainty and the native lookup cause", async () => {
    const { runOutcome } = require("../../../src/core/outcomes.js");
    const { reportText } = require("../../../src/core/run-report.js");
    const { job } = fixture();
    job.publication.actualPath = () => { throw new OperationError("Canonical name lookup failed."); };
    await assert.rejects(() => publishPdf(job, staged, target), (error) => {
        const outcome = runOutcome([{ state: "recovered", sources: ["/photo.jpg"], pages: 1, recovery: error.recovery, issues: error.issues }]);
        assert.ok(reportText(outcome).includes(`Saved elsewhere:\n${staged}\nA finished copy was created, but its stored filename could not be verified. The validated original was retained. Canonical name lookup failed.`));
        assert.ok(error.cause); return true;
    });
});


test("name-readback programming faults retain the original exactly once and stay fatal through application", async () => {
    const { executeDocuments } = require("../../../src/application/documents.js");
    const { fixture: documentFixture } = require("../application/fixture-documents.cjs");
    for (const Failure of [TypeError, ReferenceError]) {
        for (const location of ["public", "downloads", "staged-downloads"]) {
            const { app, job } = fixture();
            const { link } = job.publication;
            const cause = new Failure("Name readback implementation failed.");
            let lookups = 0;
            job.publication.link = (from, to) => {
                if (location === "public") { return link(from, to); }
                if (!to.startsWith("/Downloads/")) { return { state: "denied" }; }
                return location === "staged-downloads" && from === staged ? { state: "cross-device" } : link(from, to);
            };
            job.publication.actualPath = () => { lookups += 1; throw cause; };
            const sample = documentFixture(2, { mode: "separate", ports: { publish: async () => (await publishPdf(job, staged, target)) } });
            // eslint-disable-next-line no-await-in-loop -- Complete and inspect this fixture before the next case.
            const records = (await executeDocuments(sample.ports, sample.plans));
            assert.equal(records[0].state, "recovered"); assert.equal(records[0].recovery, staged); assert.equal(records[0].fatal, true);
            assert.equal(records[0].issues[0].code, "fault"); assert.equal(records[1].state, "not-started");
            assert.equal(lookups, 1, "no reconfirmation or duplicate fallback lookup");
            assert.equal(app.events.filter(([event]) => event === "copyBeside").length, location === "staged-downloads" ? 1 : 0);
            assert.ok(app.files.has(staged)); assert.equal(job.artifacts.get(staged).state, "validated");
        }
    }
});

test("typed cancellation during name readback keeps its meaning and explicit recovery without reconfirmation", async () => {
    const { executeDocuments } = require("../../../src/application/documents.js");
    const { runOutcome } = require("../../../src/core/outcomes.js");
    const { fixture: documentFixture } = require("../application/fixture-documents.cjs");
    const { job } = fixture();
    const cause = new UserCanceled();
    let lookups = 0;
    job.publication.actualPath = () => { lookups += 1; throw cause; };
    const sample = documentFixture(2, { mode: "separate", ports: { publish: async () => (await publishPdf(job, staged, target)) } });
    const records = (await executeDocuments(sample.ports, sample.plans));
    assert.equal(records[0].state, "recovered"); assert.equal(records[0].recovery, staged);
    assert.equal(records[0].issues[0].code, "canceled"); assert.equal(records[1].state, "not-started");
    assert.equal(runOutcome(records).state, "canceled"); assert.equal(lookups, 1);
});

test("a name-readback preservation wrapper keeps the original programming cause and stack", async () => {
    const { job } = fixture();
    const cause = new TypeError("Native name bridge bug.");
    job.publication.actualPath = () => { throw cause; };
    await assert.rejects(() => publishPdf(job, staged, target), (error) => error.cause === cause && error.stack === cause.stack && error.recovery === staged && error.issues[0].code === "fault");
});
