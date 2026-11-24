"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { publishPdf } = require("../../../src/application/publish.js");
const { UserCanceled } = require("../../../src/core/errors.js");
const { fixture, staged, target } = require("../ports/publication-fixture.cjs");

test("publication confirms identity and returns its actual destination", async () => {
    const { app, job } = fixture();
    const before = app.publication.facts(staged);
    assert.deepEqual((await publishPdf(job, staged, target)), { state: "saved", path: target, issues: [] });
    assert.deepEqual(app.publication.facts(target), before);
    assert.ok(!app.files.has(staged));
    assert.ok([...job.artifacts.values()].every(artifact=>artifact.state==="released"));
});

for (const options of [{ files: [staged, target] }, { directories: [target] }, { danglingLinks: [target] }]) {
    test(`occupied destination ${JSON.stringify(options)} is preserved`, async () => {
        const { app, job } = fixture(options);
        const result = (await publishPdf(job, staged, target));
        assert.equal(result.path, "/out/result 2.pdf");
        assert.ok(![...app.files.keys()].some((path) => path.startsWith(`${target}/`)));
        assert.ok(!app.events.some(([event]) => event === "copyBeside"));
    });
}

for (const state of ["denied", "unknown"]) {
    test(`${state} is a publication failure, not a collision retry`, async () => {
        const { job } = fixture();
        let calls = 0;
        const { link } = job.publication;
        job.publication.link = (from, to) => {
            if (!to.startsWith("/out/")) { return link(from, to); }
            calls += 1;
            return { state, diagnostic: { code: 13 } };
        };
        await assert.rejects(() => publishPdf(job, staged, target), (error) => {
            assert.equal(error.recovery === staged, state === "unknown");
            assert.equal(error.issues[0].code, "publication");
            return true;
        });
        assert.equal(calls, 1);
    });
}

for (const state of ["cross-device", "unsupported"]) {
    test(`${state} uses an expendable destination copy`, async () => {
        const { job, app } = fixture();
        let calls = 0;
        const {link} = job.publication;
        job.publication.link = (from, to) => { calls += 1; return calls === 1 ? { state } : link(from, to); };
        assert.equal((await publishPdf(job, staged, target)).path, target);
        assert.ok(app.events.some(([event]) => event === "copyBeside"));
        assert.ok([...job.artifacts.values()].every(artifact=>artifact.state==="released"));
    });
}

test("unsupported links on destination volume use exclusive rename of a copy", async () => {
    const { job, app } = fixture();
    job.publication.link = () => ({ state: "unsupported" });
    assert.equal((await publishPdf(job, staged, target)).path, target);
    assert.ok(app.files.has(target));
    assert.ok(!app.files.has(staged));
});

test("an identity mismatch retains a structured recovery location", async () => {
    const { job, app } = fixture({ files: [staged, "/other.pdf"] });
    job.publication.link = (ignored, to) => app.publication.rename("/other.pdf", to);
    await assert.rejects(() => publishPdf(job, staged, target), (error) => {
        assert.ok(error.recovery); return true;
    });
    assert.ok(app.files.has(target));
});

test("stop after the native side effect confirms committed output", async () => {
    const { job, app } = fixture();
    const {link} = job.publication;
    job.publication.link = (from, to) => { link(from, to); throw new UserCanceled(); };
    assert.equal((await publishPdf(job, staged, target)).path, target);
    assert.ok(app.files.has(target));
    assert.ok([...job.artifacts.values()].every(artifact=>artifact.state==="released"));
});

test("stop before claim preserves the validated PDF rather than deleting it", async () => {
    const { job, app } = fixture();
    job.progress.phase = () => { throw new UserCanceled(); };
    await assert.rejects(() => publishPdf(job, staged, target), (error) => {
        assert.equal(error.issues[0].code, "canceled"); assert.ok(error.recovery); return true;
    });
    assert.ok(!app.files.has(target));
});

test("failed recovery preserves the validated workspace and ownership", async () => {
    const { job, app } = fixture({ faults: { copyBeside: new Error("denied") } });
    job.publication.link = () => ({ state: "denied" });
    await assert.rejects(() => publishPdf(job, staged, target), (error) => error.recovery === staged);
    assert.ok(job.artifacts.has(staged));
    assert.ok(app.files.has(staged));
});

test("unknown original identity fails before any claim", async () => {
    const { job } = fixture();
    job.publication.facts = () => ({ identity: "", size: -1 });
    let called = false;
    job.publication.link = () => { called = true; return { state: "created" }; };
    await assert.rejects(() => publishPdf(job, staged, target), (error) => error.recovery === null && error.issues[0].code === "fault");
    assert.equal(called, false);
});

test("exhausted collision search is bounded and preserves validated work",async ()=>{
    const {job}=fixture();
    let calls=0;
    job.publication.link=()=>{calls+=1;return {state:"exists"};};
    await assert.rejects(()=>publishPdf(job,staged,target),/unique output filename/u);
    assert.equal(calls,19998);
});

test("stop during destination copy retains recovery and clears only the owned area",async ()=>{
    const {job}=fixture({faults: { copyBeside: new UserCanceled() }});
    job.publication.link=()=>({state:"unsupported"});
    await assert.rejects(()=>publishPdf(job,staged,target),(error)=>error.issues[0].code==="canceled");
});

test("unknown faults in a native adapter remain fatal diagnostics after recovery",async ()=>{
    const {job}=fixture();
    job.publication.link=()=>{throw new TypeError("native bridge bug");};
    await assert.rejects(()=>publishPdf(job,staged,target),(error)=>error.issues[0].code==="fault");
});

test("a measured zero-byte validated candidate is not published",async ()=>{
    const {job}=fixture({emptyFiles:[staged]});
    await assert.rejects(()=>publishPdf(job,staged,target), (error) => error.recovery === null && error.issues[0].code === "fault");
});

test("publication cannot acquire ownership merely from a pathname",async ()=>{
    const {job,app}=fixture();job.artifacts.clear();
    await assert.rejects(()=>publishPdf(job,staged,target),/owned validated PDF/u);
    assert.ok(app.files.has(staged));assert.ok(!app.files.has(target));
});

test("recovery releases ownership only after confirmation and retains classified failure details",async ()=>{
    const {job}=fixture(), { link } = job.publication;
    job.publication.link=(from, to)=>to === target ? {state:"denied",diagnostic:{code:13,domain:"NSPOSIXErrorDomain"}} : link(from, to);
    await assert.rejects(()=>publishPdf(job,staged,target),(error)=>{
        assert.match(error.message,/The PDF could not be saved where it was meant to go\.\n\n/u);
        assert.match(error.message,/The finished PDF has been kept here:\n\n/u);
        assert.deepEqual(error.issues[0],{code:"publication",stage:"publication",params:{},message:"The PDF could not be saved to its requested destination.",diagnostic:{code:13,domain:"NSPOSIXErrorDomain",state:"denied",message:"The PDF destination could not be claimed (denied)."}});
        return true;
    });
    assert.ok([...job.artifacts.values()].every(artifact=>artifact.state==="released"));
});

test("a same-identity size mismatch cannot release the validated original",async ()=>{
    const {job,app}=fixture();const {link} = job.publication;
    job.publication.link=(from,to)=>{const result=link(from,to);app.files.set(to, { ...job.publication.facts(to), size: 7 });return result;};
    await assert.rejects(()=>publishPdf(job,staged,target),(error)=>error.issues[0].code==="publication"&&error.issues[0].diagnostic.path===target&&error.recovery===staged);
    assert.ok(app.files.has(target));
    assert.ok(app.files.has(staged));
});

test("a native stop after the claim is acknowledged only after commit and before more work",async ()=>{
    const {job}=fixture();const {link} = job.publication;
    job.publication.link=(from,to)=>{link(from,to);throw new UserCanceled();};
    assert.equal((await publishPdf(job,staged,target)).path,target);
    assert.throws(()=>job.progress.phase("Next document"),/User canceled/u);
});

test("destination staging cleanup is observed without unmaking a saved output",async ()=>{
    const {job,app}=fixture({faults: { closeStaging: new UserCanceled() }});
    let calls=0;const {link} = job.publication;
    job.publication.link=(from,to)=>{calls+=1;return calls===1?{state:"cross-device"}:link(from,to);};
    assert.equal((await publishPdf(job,staged,target)).path,target);assert.ok(app.files.has(target));
    assert.equal(job.cleanupIssues[0].code,"canceled");
    assert.throws(()=>job.progress.phase("Next document"),/User canceled/u);
});

test("an unexpected null native fault preserves the validated PDF as a fatal diagnostic",async ()=>{
    const {job}=fixture();job.publication.link=()=>{
        // Deliberate malformed exception to verify the fatal-outcome boundary.
        // eslint-disable-next-line no-throw-literal
        throw null;
    };
    await assert.rejects(()=>publishPdf(job,staged,target),(error)=>error.issues[0].code==="fault"&&Boolean(error.recovery));
});

test("recovery cleanup and cancellation issues survive the publication outcome",async ()=>{
    for(const fault of [new Error("denied"),new UserCanceled()]){
        const {job}=fixture({faults: { removeFile: (path) => path === staged ? fault : undefined }});
        const { link } = job.publication;
    job.publication.link=(from, to)=>to === target ? {state:"denied"} : link(from, to);
        // eslint-disable-next-line no-await-in-loop -- Settle and inspect this fixture before the next case.
        await assert.rejects(()=>publishPdf(job,staged,target),(error)=>{
            assert.equal(error.issues[0].code,"publication");assert.equal(error.issues[1].code,fault instanceof UserCanceled?"canceled":"cleanup");
            assert.ok(error.recovery);return true;
        });
    }
});

test("stop while releasing the confirmed private copy cannot erase the committed result",async ()=>{
    const {job,app}=fixture({faults: { removeFile: (path) => path === staged ? new UserCanceled() : undefined }});
    assert.equal((await publishPdf(job,staged,target)).path,target);assert.ok(app.files.has(target));
    assert.equal(job.cleanupIssues[0].code,"canceled");assert.throws(()=>job.progress.phase("Next document"),/User canceled/u);
});

test("successful staging cleanup never invents a stop request",async ()=>{
    const {job}=fixture();let calls=0;const {link} = job.publication;
    job.publication.link=(from,to)=>{calls+=1;return calls===1?{state:"cross-device"}:link(from,to);};
    assert.equal((await publishPdf(job,staged,target)).path,target);assert.doesNotThrow(()=>job.progress.phase("Next document"));
});

test("post-confirmation release fault preserves the saved result and retains workspace ownership",async ()=>{
    const {job,app}=fixture();const artifact=job.artifacts.get(staged);
    Object.defineProperty(artifact,"state",{get:()=>"validated",set(){throw new TypeError("release fault");}});
    assert.equal((await publishPdf(job,staged,target)).path,target);assert.ok(app.files.has(target));
    assert.equal(job.cleanupIssues[0].message,"release fault");assert.equal(artifact.state,"validated");
});

test("recovery release fault cannot erase the confirmed external recovery location",async ()=>{
    const {job,app}=fixture();const artifact=job.artifacts.get(staged);
    Object.defineProperty(artifact,"state",{get:()=>"validated",set(){throw new TypeError("recovery release fault");}});
    const { link } = job.publication;
    job.publication.link=(from, to)=>to === target ? {state:"denied"} : link(from, to);
    await assert.rejects(()=>publishPdf(job,staged,target),error=>app.files.has(error.recovery)&&error.issues.some(issue=>issue.message==="recovery release fault"));
});

test("diagnostic assembly faults after confirmation preserve the actual published path",async ()=>{
    const {job,app}=fixture();job.cleanupIssues.slice=()=>{throw new TypeError("post-confirmation diagnostics fault");};
    const result=(await publishPdf(job,staged,target));
    assert.equal(result.path,target);assert.equal(result.state,"saved");assert.ok(app.files.has(target));
    assert.equal(result.issues[0].message,"post-confirmation diagnostics fault");assert.equal(result.issues[0].stage,"cleanup");assert.ok(!app.files.has(staged));
});

test("a later staging failure reports its current cause instead of an earlier collision", async () => {
    const { job, app } = fixture({ files: [staged, target], faults: { openStaging: new Error("Current destination copy is denied.") } });
    const { link } = job.publication;
    let attempts = 0;
    job.publication.link = (from, to) => {
        if (!to.startsWith("/out/")) { return link(from, to); }
        attempts += 1;
        return attempts === 1 ? { state: "exists", diagnostic: { message: "Old collision." } } : { state: "cross-device" };
    };
    await assert.rejects(() => publishPdf(job, staged, target), (error) => {
        assert.match(error.issues[0].diagnostic.message, /Current destination copy is denied/u);
        assert.doesNotMatch(error.issues[0].diagnostic.message, /Old collision/u);
        assert.ok(error.recovery);
        return true;
    });
    assert.ok(app.files.has(target), "the earlier occupied output remains untouched");
});

test("a move with a refreshed identity holds its proof until publication settles", async () => {
    const { job, app } = fixture();
    const { rename, facts, actualPath } = job.publication;
    let settled = false;
    let closed = false;
    let moved = null;
    job.publication.link = () => ({ state: "unsupported" });
    job.publication.facts = (file) => file === target && moved ? moved : facts(file);
    job.publication.actualPath = (file, claimed) => {
        assert.equal(claimed.identity, "moved-identity");
        assert.equal(closed, false);
        settled = true;
        return actualPath(file, claimed);
    };
    job.publication.rename = (from, to) => {
        assert.equal(rename(from, to).state, "created");
        moved = { ...facts(to), identity: "moved-identity" };
        return { state: "created", claimed: moved, close() { closed = true; } };
    };
    assert.equal((await publishPdf(job, staged, target)).path, target);
    assert.equal(settled, true);
    assert.equal(closed, true);
    assert.equal(app.files.has(staged), false);
});
