"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {createJob,runJob}=require("../../../src/host/job.js");
const {createFakeHost}=require("../ports/fake-host.cjs");
const {imageOf}=require("../ports/fake-job.cjs");
const {UserCancelled}=require("../../../src/core/errors.js");
const {removeOwned,requireReleasedResources}=require("../../../src/host/owned-cleanup.js");
const {removeFile}=require("../../../src/host/shell.js");
const settings={paperSize:"A4",orientation:"Portrait",mode:"separate",resolutionLimit:72,quality:85,background:"#FFFFFF"};
const tools={vips:"/v/vips",vipsheader:"/v/vipsheader",pdfcpu:"/v/pdfcpu"};
function fixture(failures=[]){
    const app=createFakeHost({files:["/a/1.png","/a/2.png"],failures});
    const job=createJob(app,settings,"20261029_070000",tools);
    job.sources=app.sources;job.publication=app.publication;
    return {app,job};
}

for(const path of ["input-0","-prepared.v"]){
    test(`failed owned cleanup ${path} stops before more capture or publication`,()=>{
        const {app,job}=fixture([["'/bin/rm' '-f'",(command)=>command.includes(path)?new Error("denied"):undefined]]);
        const result=runJob(job,[imageOf("/a/1.png"),imageOf("/a/2.png")]);
        assert.equal(result.state,"incomplete");assert.deepEqual(result.documents.map((record)=>record.state),["failed","not-started"]);
        assert.equal(result.documents[0].fatal,true);assert.equal(result.documents[0].issues[0].code,"cleanup");
        assert.ok(!app.commands.some((command)=>command.includes("'import'")));
        assert.ok(app.files.has("/a/1.png"));assert.ok(app.files.has("/a/2.png"));
    });
}

test("cleanup after import fails closed before validation and preserves a bounded queue",()=>{
    const {app,job}=fixture([["'/bin/rm' '-f'",(command)=>command.includes("-page.jpg")?new Error("denied"):undefined]]);
    const result=runJob(job,[imageOf("/a/1.png"),imageOf("/a/2.png")]);
    assert.equal(result.documents[0].issues[0].stage,"cleanup");
    assert.ok(!app.commands.some((command)=>command.includes("'validate'")));
    assert.equal(result.documents[1].state,"not-started");
});

test("cleanup cancellation remains cancellation and never erases prior outcomes",()=>{
    const {job}=fixture([["'/bin/rm' '-f'",new UserCancelled()]]);
    const result=runJob(job,[imageOf("/a/1.png"),imageOf("/a/2.png")]);
    assert.equal(result.state,"cancelled");assert.equal(result.documents[0].state,"cancelled");
    assert.equal(result.documents[1].state,"not-started");
});

test("workspace removal failure is diagnostic after a confirmed saved document",()=>{
    const {job}=fixture([["'/bin/rm' '-rf'",new Error("denied")]]);
    const result=runJob(job,[imageOf("/a/1.png")]);
    assert.equal(result.state,"complete");assert.equal(result.documents[0].state,"saved");
    assert.equal(result.diagnostics[0].code,"cleanup");assert.match(result.diagnostics[0].diagnostic.command,/-rf/u);
});

test("owned cleanup records paths, while successful and empty removal remain harmless",()=>{
    const {app,job}=fixture([["'/bin/rm'",new Error("denied")]]);
    removeOwned(job,"/owned");assert.equal(job.cleanupIssues[0].source,"/owned");
    assert.throws(()=>requireReleasedResources(job),(error)=>error.issues[0].code==="cleanup");
    assert.deepEqual(removeFile(app,""),{state:"removed"});
});
