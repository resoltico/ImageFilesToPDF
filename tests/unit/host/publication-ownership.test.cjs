"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { publishPdf } = require("../../../src/host/publish.js");
const { OperationError } = require("../../../src/core/errors.js");
const { fixture, staged, target } = require("../ports/publication-fixture.cjs");

test("a claimed PDF with an unverifiable name preserves the validated original without another recovery", () => {
    for (const copied of [false, true]) {
        const { app, job } = fixture();
        const { link } = job.publication;
        let claims = 0;
        job.publication.link = (from, to) => { claims += 1; return copied && claims === 1 ? { state: "cross-device" } : link(from, to); };
        job.publication.actualPath = () => { throw new OperationError("Canonical name unavailable."); };
        assert.throws(() => publishPdf(job, staged, target), (error) => {
            assert.equal(error.recovery, staged);
            assert.equal(error.issues[0].code, "publication");
            assert.match(error.issues[0].message, /finished copy was created.*stored filename.*validated original was retained/u);
            assert.equal(error.issues[0].diagnostic.folder, "/out/");
            assert.equal(Object.hasOwn(error.issues[0].diagnostic, "path"), false, "no guessed public output path");
            return true;
        });
        assert.ok(app.files.has(staged)); assert.ok(app.files.has(target));
        assert.equal(job.artifacts.get(staged).state, "validated");
        assert.equal([...app.files].some((path) => path.startsWith("/Downloads/")), false);
        assert.equal(app.commands.some((command) => command.includes("ImageFilesToPDF-recovered")), false);
    }
});

test("unverifiable Downloads and private-copy names never delete or duplicate their validated originals", () => {
    for (const downloads of [true, false]) {
        const { app, job } = fixture();
        const { link } = job.publication;
        job.publication.link = (from, to) => downloads && to.startsWith("/Downloads/") ? link(from, to) : { state: "denied" };
        job.publication.actualPath = () => { throw new OperationError("Canonical recovery name unavailable."); };
        assert.throws(() => publishPdf(job, staged, target), (error) => error.recovery === staged);
        assert.ok(app.files.has(staged)); assert.equal(job.artifacts.get(staged).state, "validated");
        const claims = [...app.files].filter((path) => path !== staged);
        assert.equal(claims.length, 1, "one claimed copy is left untouched; no duplicate fallback");
        assert.ok(claims[0].startsWith(downloads ? "/Downloads/" : "/var/folders/"));
    }
});

test("publication results use the authoritative stored path instead of the intended candidate", () => {
    const { app, job } = fixture();
    const actual = "/out/résult.pdf";
    job.publication.actualPath = (path, expected) => {
        assert.equal(path, target); assert.deepEqual(expected, app.publication.facts(path));
        app.files.add(actual);
        return actual;
    };
    assert.equal(publishPdf(job, staged, target).path, actual);
    assert.ok(!app.files.has(staged));
});


test("changed, missing or uninspectable originals cannot enter generic recovery after a claim", () => {
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
        assert.throws(() => publishPdf(job, staged, target), (error) => {
            assert.equal(error.recovery, null); assert.equal(error.issues[0].code, "fault");
            assert.deepEqual(error.issues[0].diagnostic.observed, observation ?? { error: "Original inspection denied." });
            assert.equal(error.issues[0].diagnostic.folder, "/out/");
            assert.match(error.issues[0].message, /A finished copy was created.*no trustworthy recovery path/u);
            return true;
        });
        assert.ok(app.files.has(staged)); assert.ok(app.files.has(target));
        assert.equal(job.artifacts.get(staged).state, "validated");
        assert.equal(app.commands.some((command) => /keeping the validated|ImageFilesToPDF-recovered|\/bin\/cp/u.test(command)), false);
        assert.equal([...app.files].some((path) => path.startsWith("/Downloads/")), false);
    }
});


test("the actual publication refusal with no verified original produces failed application output without a recovery path", () => {
    const { executeDocuments } = require("../../../src/application/documents.js");
    const { fixture: documentFixture } = require("../application/document-fixture.cjs");
    const { job } = fixture();
    const { facts } = job.publication;
    let changed = false;
    job.publication.actualPath = () => { changed = true; throw new OperationError("Name query refused."); };
    job.publication.facts = (path) => changed && path === staged ? { identity: "", size: -1 } : facts(path);
    const sample = documentFixture(2, { mode: "separate", ports: { publish: () => publishPdf(job, staged, target) } });
    const records = executeDocuments(sample.ports, sample.plans);
    assert.equal(records[0].state, "failed"); assert.equal(records[0].fatal, true);
    assert.equal(records[0].issues[0].code, "fault"); assert.equal(Object.hasOwn(records[0], "recovery"), false);
    assert.equal(records[1].state, "not-started"); assert.equal(job.artifacts.get(staged).state, "validated");
});


test("initial original inspection refusal carries no invented recovery path", () => {
    const { app, job } = fixture();
    const cause = new Error("Original attributes unavailable.");
    job.publication.facts = () => { throw cause; };
    assert.throws(() => publishPdf(job, staged, target), (error) => error.recovery === null && error.cause === cause && error.issues[0].code === "fault");
    assert.ok(app.files.has(staged)); assert.ok(!app.files.has(target));
    assert.equal(app.commands.length, 0);
});

test("a changed original is refused before destination-stage copying", () => {
    const { app, job } = fixture();
    const { facts } = job.publication;
    let changed = false;
    job.publication.link = () => { changed = true; return { state: "cross-device" }; };
    job.publication.facts = (path) => changed && path === staged ? { identity: "1:99", size: facts(path).size } : facts(path);
    assert.throws(() => publishPdf(job, staged, target), (error) => error.recovery === null && error.issues[0].code === "fault");
    assert.equal(app.commands.some((command) => command.includes("/bin/cp")), false);
    assert.ok(app.files.has(staged)); assert.ok(!app.files.has(target));
});

test("same-size original replacement during destination copying cannot publish or delete either candidate", () => {
    const { app, job } = fixture();
    const execute = app.doShellScript, read = job.publication.facts;
    const original = read(staged);
    let changed = false, claims = 0;
    job.publication.link = () => { claims += 1; return { state: "cross-device" }; };
    app.doShellScript = (command) => { const result = execute(command); if (command.includes("/bin/cp")) { changed = true; } return result; };
    job.publication.facts = (path) => changed && path === staged ? { identity: "9:9", size: original.size } : read(path);
    assert.throws(() => publishPdf(job, staged, target), (error) => {
        assert.equal(error.recovery, null); assert.equal(error.issues[0].code, "fault");
        assert.match(error.issues[0].diagnostic.candidate.folder, /^\/out\/\.ImageFilesToPDF-/u);
        assert.ok(error.issues[0].diagnostic.candidate.identity); return true;
    });
    assert.equal(claims, 1); assert.ok(!app.files.has(target)); assert.ok(app.files.has(staged));
    assert.equal([...app.files].filter((path) => path.endsWith("/ready.pdf") && path !== staged).length, 1);
    assert.equal(job.artifacts.get(staged).state, "validated");
});

test("confirmed public output survives original replacement during name lookup with a fatal cleanup issue", () => {
    const { executeDocuments } = require("../../../src/application/documents.js");
    const { fixture: documentFixture } = require("../application/document-fixture.cjs");
    const { app, job } = fixture();
    const read = job.publication.facts;
    const original = read(staged);
    let changed = false;
    job.publication.actualPath = (path) => { changed = true; return path; };
    job.publication.facts = (path) => changed && path === staged ? { identity: "9:9", size: original.size } : read(path);
    const sample = documentFixture(2, { mode: "separate", ports: { publish: () => publishPdf(job, staged, target) } });
    const records = executeDocuments(sample.ports, sample.plans);
    assert.equal(records[0].state, "saved"); assert.equal(records[0].output, target); assert.equal(records[0].fatal, true);
    assert.equal(records[0].issues[0].code, "fault"); assert.equal(records[0].issues[0].stage, "cleanup");
    assert.equal(records[0].issues[0].message, "The original PDF could not be verified and was not removed.");
    assert.equal(records[1].state, "not-started");
    assert.ok(app.files.has(staged)); assert.ok(app.files.has(target)); assert.equal(job.artifacts.get(staged).state, "validated");
    assert.equal(app.commands.some((command) => command.includes("'/bin/rm' '-f' '/work/ready.pdf'")), false);
});

test("original replacement before Downloads release preserves its named candidate without claiming recovery", () => {
    const { app, job } = fixture();
    const { link } = job.publication;
    const read = job.publication.facts;
    const original = read(staged);
    let changed = false;
    job.publication.link = (from, to) => to.startsWith("/Downloads/") ? link(from, to) : { state: "denied" };
    job.publication.actualPath = (path) => { changed = true; return path; };
    job.publication.facts = (path) => changed && path === staged ? { identity: "9:9", size: original.size } : read(path);
    assert.throws(() => publishPdf(job, staged, target), (error) => {
        assert.equal(error.recovery, null); assert.equal(error.issues[0].diagnostic.candidate.path, "/Downloads/result.pdf"); return true;
    });
    assert.ok(app.files.has(staged)); assert.ok(app.files.has("/Downloads/result.pdf"));
    assert.equal(job.artifacts.get(staged).state, "validated");
});


test("the human recovery report keeps creation/name uncertainty and the native lookup cause", () => {
    const { runOutcome } = require("../../../src/core/outcomes.js");
    const { reportText } = require("../../../src/core/run-report.js");
    const { job } = fixture();
    job.publication.actualPath = () => { throw new OperationError("Canonical name lookup failed."); };
    assert.throws(() => publishPdf(job, staged, target), (error) => {
        const outcome = runOutcome([{ state: "recovered", sources: ["/photo.jpg"], pages: 1, recovery: error.recovery, issues: error.issues }]);
        assert.ok(reportText(outcome).includes(`Saved elsewhere:\n${staged}\nA finished copy was created, but its stored filename could not be verified. The validated original was retained. Canonical name lookup failed.`));
        assert.ok(error.cause); return true;
    });
});
