"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {importBatch,validatePdf}=require("../../../src/host/staging.js");
const {createFakeHost}=require("../ports/fake-host.cjs");
const {makeJob}=require("../ports/fake-job.cjs");

for(const [operation,label] of [["import","creating PDF pages"],["info","counting the pages"],["validate","validating PDF"]]){
    test(`backend failures identify the document stage: ${operation}`,()=>{
        const host=createFakeHost({files:["/stage.pdf","/page.jpg"],failures:[["'info'","Page count: 1"],[`'${operation}'`,new Error("failed")]].reverse()});
        const job=makeJob(host);job.parts.set("/stage.pdf",[]);
        assert.throws(()=>operation==="import"?importBatch(job,"/stage.pdf",["/page.jpg"],{relativeScale:1}):validatePdf(job,"/stage.pdf",1),(error)=>error.message.includes(`while ${label}`));
    });
}

test("strict validation announces its phase and refuses missing partial documents",()=>{
    const host=createFakeHost({files:["/stage.pdf"],failures:[["'info'","Page count: 1"]]});const job=makeJob(host);job.parts.set("/stage.pdf",[]);const phases=[];
    job.progress.phase=(phase)=>phases.push(phase);validatePdf(job,"/stage.pdf",1);
    assert.deepEqual(phases,["Validating PDF"]);
    assert.throws(()=>validatePdf(makeJob(createFakeHost()),"/absent.pdf",1),/partial PDF is not a file with anything in it/u);
});
