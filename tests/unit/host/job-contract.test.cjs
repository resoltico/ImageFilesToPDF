"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {Buffer}=require("node:buffer");
const {createJob,runJob,unitsOf}=require("../../../src/host/job.js");
const {createFakeHost}=require("../ports/fake-host.cjs");
const {imageOf}=require("../ports/fake-job.cjs");
const {createProgress}=require("../../../src/host/progress.js");
const settings={paperSize:"A4",orientation:"Portrait",mode:"combined",resolutionLimit:72,quality:85,background:"#FFFFFF"};
const tools={vips:"/v/vips",vipsheader:"/v/vipsheader",pdfcpu:"/v/pdfcpu"};
const stamp="20261029_070000";

function jobFixture(mode="combined",failures=[]) {
    const app=createFakeHost({files:["/a/1.png","/a/2.png"],failures});
    const job=createJob(app,{...settings,mode},stamp,tools);
    const events=[];
    job.sources=app.sources;job.publication=app.publication;
    job.progress=createProgress([{start:(units)=>events.push(["expect",units]),report:(done,text,detail)=>events.push([done,text,detail])}]);
    const {beginning}=job.progress;
    job.progress.beginning=(index,name)=>{events.push(["source",index,name]);beginning(index,name);};
    job.progress.expect({units:mode === "combined" ? 3 : 2,images:2});
    return {job,app,events};
}

test("job carries validated settings, exact geometry, ownership and explicit progress units",()=>{
    const {job}=jobFixture();
    assert.equal(job.timestamp,stamp);assert.equal(job.tools,tools);
    assert.deepEqual(job.settings,settings);
    assert.deepEqual(job.geometry,{widthPixels:595,heightPixels:842,widthPoints:595.2756,heightPoints:841.8898,resolutionLimit:72});
    assert.ok([...job.artifacts.values()].every(artifact=>artifact.state==="released"));
    assert.equal(unitsOf(settings,2),3);assert.equal(unitsOf({...settings,mode:"separate"},2),2);
    job.progress.phase("Checking");assert.deepEqual(job.progress.diagnostics,[]);
});


for(const mode of ["combined","separate"]) {
    test(`${mode} source positions, completion events, and output paths follow the plan`,()=>{
        const {job,app,events}=jobFixture(mode);
        const result=runJob(job,[imageOf("/a/1.png"),imageOf("/a/2.png")]);
        assert.equal(result.state,"complete");
        assert.deepEqual(events.filter((event)=>event[0]==="source").map((event)=>event.slice(1)),[[1,"1.png"],[2,"2.png"]]);
        assert.equal(events.at(-1)[0],mode==="combined"?3:2);
        assert.equal(events.at(-1)[1],"Saved");
        assert.deepEqual(result.documents.map((document)=>document.output),mode==="combined"?["/a/output_20261029_070000.pdf"]:["/a/1_20261029_070000.pdf","/a/2_20261029_070000.pdf"]);
        assert.ok(app.commands.some((command)=>command.includes("'/bin/rm' '-rf'")));
    });
}

test("ordinary separate failures advance attempted-work progress and continue",()=>{
    const {job,events}=jobFixture("separate",[["'thumbnail'",new Error("damage")]]);
    const result=runJob(job,[imageOf("/a/1.png"),imageOf("/a/2.png")]);
    assert.deepEqual(result.documents.map((document)=>document.state),["failed","failed"]);
    assert.equal(events.at(-1)[0],2);assert.equal(events.at(-1)[1],"Finished");
});

test("unconfirmed validated work keeps the workspace even after unexpected publication faults",()=>{
    const {job,app}=jobFixture("combined",[["'/bin/cp'",new Error("recovery denied")]]);
    job.publication.link=()=>{throw new TypeError("bridge fault");};
    const result=runJob(job,[imageOf("/a/1.png")]);
    assert.equal(result.documents[0].state,"recovered");
    assert.equal(job.artifacts.size,1);
    assert.ok(!app.commands.some((command)=>command.includes("'/bin/rm' '-rf'")));
});

test("a default job has an inert progress capability, not a malformed sink",()=>{
    const job=createJob(createFakeHost(),settings,stamp,tools);
    job.progress.phase("Checking");assert.deepEqual(job.progress.diagnostics,[]);
});

function longPathFixture() {
    const sources=Array.from({length:35},(unused,index)=>`/a/${index}.png`);
    const app=createFakeHost({files:sources});
    const job=createJob(app,settings,stamp,tools);
    Object.assign(job,{sources:app.sources,publication:app.publication,tools:{...tools,pdfcpu:"/opt/homebrew/Cellar/pdfcpu/0.16.4/bin/pdfcpu"}});
    job.workspace=`/${[246,246,246,245].map((width)=>"'".repeat(width)).join("/")}/ImageFilesToPDF.x`;
    const counts=[];const original=app.doShellScript;
    app.doShellScript=(command)=>{if(command.includes("'thumbnail'")){counts.push([...app.files].filter((path)=>path.endsWith("-page.jpg")).length);}return original(command);};
    return {app,job,counts,sources};
}

test("page staging stays bounded across real adapter imports, including quote-heavy valid paths",()=>{
    const {app,job,counts,sources}=longPathFixture();
    const result=runJob(job,sources.map(imageOf));
    assert.equal(result.state,"complete");assert.ok(Math.max(...counts)<=32);
    const imports=app.commands.filter((command)=>command.includes("'import'"));
    assert.equal(imports.length,2);assert.ok(imports.every((command)=>Buffer.byteLength(command,"utf8")+1<=131072));
});

test("job accumulator outlives executor and workspace teardown faults",()=>{
    const vm=require("node:vm");const fs=require("node:fs");const {createRequire}=require("node:module");
    const jobPath=require.resolve("../../../src/host/job.js");const actualRequire=createRequire(jobPath);
    const module={exports:{}};
    vm.runInNewContext(fs.readFileSync(jobPath,"utf8"),{module,globalThis,require(name){
        if(name==="../application/documents.js"){return {executeDocuments(ports,plans,records){records.push({state:"saved",sources:["/a/1.png"],pages:1,output:"/saved.pdf",issues:[]});throw new TypeError("executor bug");}};}
        if(name==="./workspace.js"){return {removeWorkspace(){throw new Error("workspace teardown bug");}};}
        return actualRequire(name);
    }}, {filename:jobPath});
    const {job}=jobFixture("combined");
    const result=module.exports.runJob(job,[imageOf("/a/1.png")]);
    assert.deepEqual([result.documents[0].output,Array.from(result.issues,issue=>issue.stage),result.state], ["/saved.pdf",["execution","cleanup"],"incomplete"]);
});
