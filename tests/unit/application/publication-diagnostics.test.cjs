"use strict";

/*
 * What a failed or unconfirmed publication records, and where.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { publishPdf } = require("../../../src/application/publish.js");
const { message } = require("../../../src/core/messages.js");
const { IssueError } = require("../../../src/core/errors.js");
const { fixture, staged, target } = require("../ports/publication-fixture.cjs");

const DOWNLOADS = "/Downloads/result.pdf";

function linking(app, decide) {
    const { link } = app.publication;
    app.publication.link = (from, to) => decide(from, to) ?? link(from, to);
}

test("an original that cannot be measured is refused with no expectation", async () => {
    const { app, job } = fixture();
    app.publication.facts = () => { throw new Error("stat failed"); };
    await assert.rejects(() => publishPdf(job, staged, target), (error) => {
        assert.equal(error.message, message("publicationOriginalUnknown"));
        assert.equal(error.issues[0].diagnostic.expected, null);
        return true;
    });
});

test("a destination failure without a diagnostic message reports the error's text", async () => {
    const { app, job } = fixture();
    linking(app, (from, to) => { if (to === target) { throw new IssueError("denied", { issues: [{ code: "operation", stage: "publication", params: {}, message: "denied" }] }); } });
    await assert.rejects(() => publishPdf(job, staged, target), (error) => {
        assert.equal(error.issues[0].diagnostic.message, "denied");
        return true;
    });
});

test("a destination that fails while the original changes names the staging folder", async () => {
    const { app, job } = fixture();
    linking(app, (from, to) => {
        if (from === staged) { return { state: "cross-device" }; }
        if (to === target) { app.files.set(staged, { identity: "changed", size: 1024 }); throw new Error("denied"); }
        return undefined;
    });
    await assert.rejects(() => publishPdf(job, staged, target), (error) => {
        assert.match(error.issues[0].diagnostic.candidate.folder, /^\/out\//u);
        return true;
    });
});

test("a Downloads recovery's cleanup issue is reported once", async () => {
    const { app, job } = fixture({ faults: { removeFile: (path) => (path === staged ? new Error("busy") : undefined) } });
    linking(app, (from, to) => { if (to === target) { throw new Error("denied"); } });
    await assert.rejects(() => publishPdf(job, staged, target), (error) => {
        assert.equal(error.recovery, DOWNLOADS);
        assert.equal(error.issues.filter((issue) => issue.diagnostic?.path === staged && issue.diagnostic?.message === "busy").length, 1);
        return true;
    });
});

test("a Downloads recovery that fails is a recovery-stage issue", async () => {
    const { app, job } = fixture();
    linking(app, () => { throw new Error("denied"); });
    await assert.rejects(() => publishPdf(job, staged, target), (error) => {
        const recovery = error.issues.find((issue) => issue.message === message("downloadsRecoveryFailed"));
        assert.equal(recovery.stage, "recovery");
        return true;
    });
});

test("an unconfirmed Downloads claim names the path and the claim", async () => {
    const { app, job } = fixture();
    linking(app, (from, to) => { if (to === target) { throw new Error("denied"); } });
    const { facts } = app.publication;
    app.publication.facts = (path) => (path === DOWNLOADS ? { identity: "someone else", size: 3 } : facts(path));
    await assert.rejects(() => publishPdf(job, staged, target), (error) => {
        assert.equal(error.issues[0].diagnostic.path, DOWNLOADS);
        assert.equal(error.issues[0].diagnostic.claimed.size, 1024);
        return true;
    });
});

test("an unconfirmed destination claim names the claim at the publication stage", async () => {
    const { app, job } = fixture();
    const { facts } = app.publication;
    app.publication.facts = (path) => (path === target ? { identity: "someone else", size: 3 } : facts(path));
    await assert.rejects(() => publishPdf(job, staged, target), (error) => {
        const [issue] = error.issues;
        assert.deepEqual([issue.stage, issue.diagnostic.path, issue.diagnostic.claimed.size], ["publication", target, 1024]);
        return true;
    });
});

test("an unconfirmed claim while the original changed names the claim as the candidate", async () => {
    const { app, job } = fixture();
    const { facts } = app.publication;
    app.publication.facts = (path) => {
        if (path === target) { app.files.set(staged, { identity: "changed", size: 1024 }); return { identity: "someone else", size: 3 }; }
        return facts(path);
    };
    await assert.rejects(() => publishPdf(job, staged, target), (error) => {
        const { candidate } = error.issues[0].diagnostic;
        assert.deepEqual([candidate.path, candidate.size], [target, 1024]);
        return true;
    });
});

test("only a cancelled cleanup asks the run to stop", async () => {
    const { app, job } = fixture({ faults: { removeFile: (path) => (path === staged ? new Error("busy") : undefined) } });
    let stops = 0;
    job.progress.requestStop = () => { stops += 1; };
    const saved = await publishPdf(job, staged, target);
    assert.equal(saved.state, "saved");
    assert.equal(stops, 0);
    assert.ok(app.events.some(([event]) => event === "removeFile"));
});

test("a release that fails after confirmation is a cleanup issue of a saved PDF", async () => {
    const { app, job } = fixture();
    linking(app, (from, to) => { if (to === target) { job.artifacts.delete(staged); } });
    const saved = await publishPdf(job, staged, target);
    assert.equal(saved.state, "saved");
    assert.ok(saved.issues.some((issue) => issue.stage === "cleanup"), JSON.stringify(saved.issues));
});

test("a stored name that cannot be read back, even as nothing, keeps the original", async () => {
    const { app, job } = fixture();
    // eslint-disable-next-line no-throw-literal -- A host bridge can throw undefined; the claim must still be kept.
    app.publication.actualPath = () => { throw undefined; };
    await assert.rejects(() => publishPdf(job, staged, target), (error) => {
        assert.ok(error instanceof IssueError);
        assert.equal(error.message, message("publicationNameUnverifiedAndOriginalKept"));
        return true;
    });
});

test("an original measured as empty is refused with what was measured", async () => {
    const { app, job } = fixture();
    app.publication.facts = () => ({ identity: "", size: 0 });
    await assert.rejects(() => publishPdf(job, staged, target), (error) => {
        assert.deepEqual([error.issues[0].diagnostic.path, error.issues[0].diagnostic.expected], [staged, { identity: "", size: 0 }]);
        return true;
    });
});

test("a release that fails after a Downloads recovery is a cleanup issue", async () => {
    const { app, job } = fixture();
    linking(app, (from, to) => { if (to === target) { job.artifacts.delete(staged); throw new Error("denied"); } });
    await assert.rejects(() => publishPdf(job, staged, target), (error) => {
        assert.equal(error.recovery, DOWNLOADS);
        assert.ok(error.issues.some((issue) => issue.stage === "cleanup"), JSON.stringify(error.issues));
        return true;
    });
});

test("a Downloads copy that fails while the original changes names its staging folder", async () => {
    const { app, job } = fixture();
    linking(app, (from, to) => {
        if (to === target) { throw new Error("denied"); }
        if (from === staged && to === DOWNLOADS) { return { state: "cross-device" }; }
        if (to === DOWNLOADS) { app.files.set(staged, { identity: "changed", size: 1024 }); throw new Error("denied too"); }
        return undefined;
    });
    await assert.rejects(() => publishPdf(job, staged, target), (error) => {
        assert.match(error.issues[0].diagnostic.candidate.folder, /^\/Downloads\//u);
        return true;
    });
});
