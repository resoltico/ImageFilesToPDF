"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {createJob,runJob}=require("../../../src/application/job.js");
const {createConversionFixture}=require("../ports/fake-conversion.cjs");
const {imageOf}=require("../ports/fake-job.cjs");
const {UserCanceled}=require("../../../src/core/errors.js");
const {removeOwned,requireReleasedResources}=require("../../../src/application/owned-cleanup.js");
const settings={paperSize:"A4",orientation:"Portrait",mode:"separate",resolutionLimit:72,quality:85,background:"#FFFFFF"};
const tools={vips:"/v/vips",vipsheader:"/v/vipsheader",pdfcpu:"/v/pdfcpu"};
async function fixture(faults={}){
    const app=createConversionFixture({files:["/a/1.png","/a/2.png"],faults});
    const job=(await createJob(app.operations,settings,"20261029_070000",{tools,storage:app.storage,destinationNames:app.destinationNames}));
    job.sources=app.sources;job.publication=app.publication;
    return {app,job};
}

for(const path of ["input-0","-page.png.v"]){
    test(`failed owned cleanup ${path} stops before more capture or publication`,async ()=>{
        const {app,job}=(await fixture({removeFile: (file) => file.includes(path) ? new Error("denied") : undefined}));
        if (path.endsWith(".v")) { app.bands = 4; }
        const images=[imageOf("/a/1.png"),imageOf("/a/2.png")];
        if (app.bands === 4) { images.forEach((image) => { image.admission.image.bands = 4; }); }
        const result=(await runJob(job,images));
        assert.equal(result.state,"incomplete");assert.deepEqual(result.documents.map((record)=>record.state),["failed","not-started"]);
        assert.equal(result.documents[0].fatal,true);assert.equal(result.documents[0].issues[0].code,"cleanup");
        assert.ok(!app.commands.some((command)=>command.includes("import")));
        assert.ok(app.files.has("/a/1.png"));assert.ok(app.files.has("/a/2.png"));
    });
}

test("cleanup after import fails closed before validation and preserves a bounded queue",async ()=>{
    const {app,job}=(await fixture({removeFile: (file) => file.includes("-page.png") ? new Error("denied") : undefined}));
    const result=(await runJob(job,[imageOf("/a/1.png"),imageOf("/a/2.png")]));
    assert.equal(result.documents[0].issues[0].stage,"cleanup");
    assert.ok(!app.commands.some((command)=>command.includes("validate")));
    assert.equal(result.documents[1].state,"not-started");
});

test("cleanup cancellation remains cancellation and never erases prior outcomes",async ()=>{
    const {job}=(await fixture({removeFile: new UserCanceled()}));
    const result=(await runJob(job,[imageOf("/a/1.png"),imageOf("/a/2.png")]));
    assert.equal(result.state,"canceled");assert.equal(result.documents[0].state,"canceled");
    assert.equal(result.documents[1].state,"not-started");
});

test("workspace removal failure is diagnostic after a confirmed saved document",async ()=>{
    const {job}=(await fixture({removeWorkspace: new Error("denied")}));
    const result=(await runJob(job,[imageOf("/a/1.png")]));
    assert.equal(result.state,"complete");assert.equal(result.documents[0].state,"saved");
    assert.equal(result.diagnostics[0].code,"cleanup");assert.deepEqual(result.diagnostics[0].diagnostic, { path: job.workspace, message: "denied" });
});

test("owned cleanup records paths, while successful and empty removal remain harmless",async ()=>{
    const {job} = await fixture({removeFile: new Error("denied")});
    removeOwned(job,"/owned");assert.equal(job.cleanupIssues[0].source,"/owned");
    assert.throws(()=>requireReleasedResources(job),(error)=>error.issues[0].code==="cleanup");
    const healthy = await fixture();
    removeOwned(healthy.job, "/absent");
    assert.deepEqual(healthy.job.cleanupIssues, []);
});
