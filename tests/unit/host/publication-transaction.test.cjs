"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { publishPdf } = require("../../../src/host/publish.js");
const { UserCancelled } = require("../../../src/core/errors.js");
const { createFakeHost } = require("../ports/fake-host.cjs");
const { makeJob } = require("../ports/fake-job.cjs");
const staged = "/work/ready.pdf";
const target = "/out/result.pdf";
function fixture(options = {}) {
    const app = createFakeHost({ files: [staged], ...options });
    const job = makeJob(app);
    job.artifacts.set(staged,{path:staged,state:"validated"});
    return { app, job };
}

test("publication confirms identity and returns its actual destination", () => {
    const { app, job } = fixture();
    const before = app.publication.facts(staged);
    assert.deepEqual(publishPdf(job, staged, target), { state: "saved", path: target, issues: [] });
    assert.deepEqual(app.publication.facts(target), before);
    assert.ok(!app.files.has(staged));
    assert.ok([...job.artifacts.values()].every(artifact=>artifact.state==="released"));
});

for (const options of [{ files: [staged, target] }, { directories: [target] }, { danglingLinks: [target] }]) {
    test(`occupied destination ${JSON.stringify(options)} is preserved`, () => {
        const { app, job } = fixture(options);
        const result = publishPdf(job, staged, target);
        assert.equal(result.path, "/out/result 2.pdf");
        assert.ok(![...app.files].some((path) => path.startsWith(`${target}/`)));
        assert.ok(!app.commands.some((command) => command.includes("'/bin/ln'")));
    });
}

for (const state of ["denied", "unknown"]) {
    test(`${state} is a publication failure, not a collision retry`, () => {
        const { job } = fixture();
        let calls = 0;
        job.publication.link = (from, to) => { if (to.startsWith("/out/")) { calls += 1; } return { state, diagnostic: { code: 13 } }; };
        assert.throws(() => publishPdf(job, staged, target), (error) => {
            assert.ok(error.recovery.endsWith("result.pdf"));
            assert.equal(error.issues[0].code, "publication");
            return true;
        });
        assert.equal(calls, 1);
    });
}

for (const state of ["cross-device", "unsupported"]) {
    test(`${state} uses an expendable destination copy`, () => {
        const { job, app } = fixture();
        let calls = 0;
        const {link} = job.publication;
        job.publication.link = (from, to) => { calls += 1; return calls === 1 ? { state } : link(from, to); };
        assert.equal(publishPdf(job, staged, target).path, target);
        assert.ok(app.commands.some((command) => command.includes("'/bin/cp'")));
        assert.ok([...job.artifacts.values()].every(artifact=>artifact.state==="released"));
    });
}

test("unsupported links on destination volume use exclusive rename of a copy", () => {
    const { job, app } = fixture();
    job.publication.link = () => ({ state: "unsupported" });
    assert.equal(publishPdf(job, staged, target).path, target);
    assert.ok(app.files.has(target));
    assert.ok(!app.files.has(staged));
});

test("an identity mismatch retains a structured recovery location", () => {
    const { job, app } = fixture({ files: [staged, "/other.pdf"] });
    job.publication.link = (ignored, to) => app.publication.rename("/other.pdf", to);
    assert.throws(() => publishPdf(job, staged, target), (error) => {
        assert.ok(error.recovery); return true;
    });
    assert.ok(app.files.has(target));
});

test("stop after the native side effect confirms committed output", () => {
    const { job, app } = fixture();
    const {link} = job.publication;
    job.publication.link = (from, to) => { link(from, to); throw new UserCancelled(); };
    assert.equal(publishPdf(job, staged, target).path, target);
    assert.ok(app.files.has(target));
    assert.ok([...job.artifacts.values()].every(artifact=>artifact.state==="released"));
});

test("stop before claim preserves the validated PDF rather than deleting it", () => {
    const { job, app } = fixture();
    job.progress.phase = () => { throw new UserCancelled(); };
    assert.throws(() => publishPdf(job, staged, target), (error) => {
        assert.equal(error.issues[0].code, "cancelled"); assert.ok(error.recovery); return true;
    });
    assert.ok(!app.files.has(target));
});

test("failed recovery preserves the validated workspace and ownership", () => {
    const { job, app } = fixture({ failures: [["'/bin/cp'", new Error("denied")]] });
    job.publication.link = () => ({ state: "denied" });
    assert.throws(() => publishPdf(job, staged, target), (error) => error.recovery === staged);
    assert.ok(job.artifacts.has(staged));
    assert.ok(app.files.has(staged));
});

test("unknown original identity fails before any claim", () => {
    const { job } = fixture({ failures: [["'/usr/bin/stat'", new Error("unknown")]] });
    job.publication.facts = () => ({ identity: "", size: -1 });
    let called = false;
    job.publication.link = () => { called = true; return { state: "created" }; };
    assert.throws(() => publishPdf(job, staged, target), (error) => Boolean(error.recovery));
    assert.equal(called, false);
});

test("exhausted collision search is bounded and preserves validated work",()=>{
    const {job}=fixture();
    let calls=0;
    job.publication.link=()=>{calls+=1;return {state:"exists"};};
    assert.throws(()=>publishPdf(job,staged,target),/unique output filename/u);
    assert.equal(calls,19998);
});

test("stop during destination copy retains recovery and clears only the owned area",()=>{
    const {job}=fixture({failures:[["'/bin/cp'",new UserCancelled()]]});
    job.publication.link=()=>({state:"unsupported"});
    assert.throws(()=>publishPdf(job,staged,target),(error)=>error.issues[0].code==="cancelled");
});

test("unknown faults in a native adapter remain fatal diagnostics after recovery",()=>{
    const {job}=fixture();
    job.publication.link=()=>{throw new TypeError("native bridge bug");};
    assert.throws(()=>publishPdf(job,staged,target),(error)=>error.issues[0].code==="fault");
});

test("a measured zero-byte validated candidate is not published",()=>{
    const {job}=fixture({emptyFiles:[staged]});
    assert.throws(()=>publishPdf(job,staged,target),/identity could not be measured/u);
});

test("publication cannot acquire ownership merely from a pathname",()=>{
    const {job,app}=fixture();job.artifacts.clear();
    assert.throws(()=>publishPdf(job,staged,target),/owned validated PDF/u);
    assert.ok(app.files.has(staged));assert.ok(!app.files.has(target));
});

test("recovery releases ownership only after confirmation and retains classified failure details",()=>{
    const {job}=fixture();job.publication.link=()=>({state:"denied",diagnostic:{code:13,domain:"NSPOSIXErrorDomain"}});
    assert.throws(()=>publishPdf(job,staged,target),(error)=>{
        assert.match(error.message,/The PDF could not be saved where it was meant to go\.\n\n/u);
        assert.match(error.message,/The finished PDF has been kept here:\n\n/u);
        assert.deepEqual(error.issues[0],{code:"publication",stage:"publication",message:"The PDF could not be saved to its requested destination.",diagnostic:{code:13,domain:"NSPOSIXErrorDomain",state:"denied"}});
        return true;
    });
    assert.ok([...job.artifacts.values()].every(artifact=>artifact.state==="released"));
});

test("a same-identity size mismatch cannot release the validated original",()=>{
    const {job,app}=fixture();const {link} = job.publication;
    job.publication.link=(from,to)=>{const result=link(from,to);app.sizes.set(to,7);return result;};
    assert.throws(()=>publishPdf(job,staged,target),(error)=>error.issues[0].code==="publication"&&error.message.includes(target));
    assert.ok(app.files.has(target));
});

test("a native stop after the claim is acknowledged only after commit and before more work",()=>{
    const {job}=fixture();const {link} = job.publication;
    job.publication.link=(from,to)=>{link(from,to);throw new UserCancelled();};
    assert.equal(publishPdf(job,staged,target).path,target);
    assert.throws(()=>job.progress.phase("Next document"),/User cancelled/u);
});

test("destination staging cleanup is observed without unmaking a saved output",()=>{
    const {job,app}=fixture({failures:[["'/bin/rmdir'",new UserCancelled()]]});
    let calls=0;const {link} = job.publication;
    job.publication.link=(from,to)=>{calls+=1;return calls===1?{state:"cross-device"}:link(from,to);};
    assert.equal(publishPdf(job,staged,target).path,target);assert.ok(app.files.has(target));
    assert.equal(job.cleanupIssues[0].code,"cancelled");
    assert.throws(()=>job.progress.phase("Next document"),/User cancelled/u);
});

test("an unexpected null native fault preserves the validated PDF as a fatal diagnostic",()=>{
    const {job}=fixture();job.publication.link=()=>{
        // Deliberate malformed exception to verify the fatal-outcome boundary.
        // eslint-disable-next-line no-throw-literal
        throw null;
    };
    assert.throws(()=>publishPdf(job,staged,target),(error)=>error.issues[0].code==="fault"&&Boolean(error.recovery));
});

test("recovery cleanup and cancellation issues survive the publication outcome",()=>{
    for(const fault of [new Error("denied"),new UserCancelled()]){
        const {job}=fixture({failures:[["'/bin/rm' '-f' '/work/ready.pdf'",fault]]});
        job.publication.link=()=>({state:"denied"});
        assert.throws(()=>publishPdf(job,staged,target),(error)=>{
            assert.equal(error.issues[0].code,"publication");assert.equal(error.issues[1].code,fault instanceof UserCancelled?"cancelled":"cleanup");
            assert.ok(error.recovery);return true;
        });
    }
});

test("stop while releasing the confirmed private copy cannot erase the committed result",()=>{
    const {job,app}=fixture({failures:[["'/bin/rm' '-f' '/work/ready.pdf'",new UserCancelled()]]});
    assert.equal(publishPdf(job,staged,target).path,target);assert.ok(app.files.has(target));
    assert.equal(job.cleanupIssues[0].code,"cancelled");assert.throws(()=>job.progress.phase("Next document"),/User cancelled/u);
});

test("successful staging cleanup never invents a stop request",()=>{
    const {job}=fixture();let calls=0;const {link} = job.publication;
    job.publication.link=(from,to)=>{calls+=1;return calls===1?{state:"cross-device"}:link(from,to);};
    assert.equal(publishPdf(job,staged,target).path,target);assert.doesNotThrow(()=>job.progress.phase("Next document"));
});

test("post-confirmation release fault preserves the saved result and retains workspace ownership",()=>{
    const {job,app}=fixture();const artifact=job.artifacts.get(staged);
    Object.defineProperty(artifact,"state",{get:()=>"validated",set(){throw new TypeError("release fault");}});
    assert.equal(publishPdf(job,staged,target).path,target);assert.ok(app.files.has(target));
    assert.equal(job.cleanupIssues[0].message,"release fault");assert.equal(artifact.state,"validated");
});

test("recovery release fault cannot erase the confirmed external recovery location",()=>{
    const {job,app}=fixture();const artifact=job.artifacts.get(staged);
    Object.defineProperty(artifact,"state",{get:()=>"validated",set(){throw new TypeError("recovery release fault");}});
    job.publication.link=()=>({state:"denied"});
    assert.throws(()=>publishPdf(job,staged,target),error=>app.files.has(error.recovery)&&error.issues.some(issue=>issue.message==="recovery release fault"));
});

test("diagnostic assembly faults after confirmation preserve the actual published path",()=>{
    const {job,app}=fixture();job.cleanupIssues.slice=()=>{throw new TypeError("post-confirmation diagnostics fault");};
    const result=publishPdf(job,staged,target);
    assert.equal(result.path,target);assert.equal(result.state,"saved");assert.ok(app.files.has(target));
    assert.equal(result.issues[0].message,"post-confirmation diagnostics fault");assert.ok(!app.files.has(staged));
});
