"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {importBatch,validatePdf}=require("../../../src/application/staging.js");
const {createConversionFixture}=require("../ports/fake-conversion.cjs");
const {makeJob}=require("../ports/fake-job.cjs");

for(const [operation,label] of [["import","creating PDF pages"],["info","counting the pages"],["validate","validating PDF"]]){
    test(`backend failures identify the document stage: ${operation}`,async ()=>{
        const host=createConversionFixture({files:["/stage.pdf","/page.jpg"],faults: { run([, verb]) {
            if (verb === operation) { return new Error("failed"); }
            return verb === "info" ? "Page count: 1" : undefined;
        } }});
        const job=makeJob(host);job.parts.set("/stage.pdf",[]);
        await assert.rejects(async ()=>operation==="import"?(await importBatch(job,"/stage.pdf",["/page.jpg"],{relativeScale:1})):(await validatePdf(job,"/stage.pdf",1)),(error)=>error.message.includes(`while ${label}`));
    });
}

test("strict validation announces its phase and refuses missing partial documents",async ()=>{
    const host=createConversionFixture({files:["/stage.pdf"],faults: { run: ([, verb]) => verb === "info" ? "Page count: 1" : undefined }});const job=makeJob(host);job.parts.set("/stage.pdf",[]);const phases=[];
    job.progress.phase=(phase)=>phases.push(phase);(await validatePdf(job,"/stage.pdf",1));
    assert.deepEqual(phases,["Validating PDF"]);
    await assert.rejects(()=>validatePdf(makeJob(createConversionFixture()),"/absent.pdf",1),/partial PDF is not a file with anything in it/u);
});
