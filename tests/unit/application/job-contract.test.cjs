"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {Buffer}=require("node:buffer");
const {createJob,runJob,unitsOf}=require("../../../src/application/job.js");
const {createConversionFixture}=require("../ports/fake-conversion.cjs");
const {imageOf}=require("../ports/fake-job.cjs");
const {createProgress}=require("../../../src/application/progress.js");
const settings={paperSize:"A4",orientation:"Portrait",mode:"combined",resolutionLimit:72,quality:85,background:"#FFFFFF"};
const tools={vips:"/v/vips",vipsheader:"/v/vipsheader",pdfcpu:"/v/pdfcpu"};
const stamp="20261029_070000";

async function jobFixture(mode="combined",faults={}) {
    const app=createConversionFixture({files:["/a/1.png","/a/2.png"],faults});
    const job=(await createJob(app.operations,{...settings,mode},stamp,{tools,storage:app.storage,destinationNames:app.destinationNames}));
    const events=[];
    job.sources=app.sources;job.publication=app.publication;
    job.progress=createProgress([{start:(units)=>events.push(["expect",units]),report:(done,text,detail)=>events.push([done,text,detail])}]);
    const {beginning}=job.progress;
    job.progress.beginning=(index,name)=>{events.push(["source",index,name]);beginning(index,name);};
    job.progress.expect({units:mode === "combined" ? 3 : 2,images:2});
    return {job,app,events};
}

test("job carries validated settings, exact geometry, ownership and explicit progress units",async ()=>{
    const {job}=(await jobFixture());
    assert.equal(job.timestamp,stamp);assert.equal(job.tools,tools);
    assert.deepEqual(job.settings,settings);
    assert.deepEqual(job.geometry,{widthPoints:595.2756,heightPoints:841.8898,resolutionLimit:72});
    assert.ok([...job.artifacts.values()].every(artifact=>artifact.state==="released"));
    assert.equal(unitsOf(settings,2),3);assert.equal(unitsOf({...settings,mode:"separate"},2),2);
    job.progress.phase("Checking");assert.deepEqual(job.progress.diagnostics,[]);
});


for(const mode of ["combined","separate"]) {
    test(`${mode} source positions, completion events, and output paths follow the plan`,async ()=>{
        const {job,app,events}=(await jobFixture(mode));
        const result=(await runJob(job,[imageOf("/a/1.png"),imageOf("/a/2.png")]));
        assert.equal(result.state,"complete");
        assert.deepEqual(events.filter((event)=>event[0]==="source").map((event)=>event.slice(1)),[[1,"1.png"],[2,"2.png"]]);
        assert.equal(events.at(-1)[0],mode==="combined"?3:2);
        assert.equal(events.at(-1)[1],"Saved");
        assert.deepEqual(result.documents.map((document)=>document.output),mode==="combined"?["/a/Images 2026-10-29 at 07.00.00.pdf"]:["/a/1.pdf","/a/2.pdf"]);
        assert.ok(app.events.some(([event]) => event === "removeWorkspace"));
    });
}

test("ordinary separate failures advance attempted-work progress and continue",async ()=>{
    const {job,events}=(await jobFixture("separate",{run: ([, operation]) => operation === "thumbnail" ? new Error("damage") : undefined}));
    const result=(await runJob(job,[imageOf("/a/1.png"),imageOf("/a/2.png")]));
    assert.deepEqual(result.documents.map((document)=>document.state),["failed","failed"]);
    assert.equal(events.at(-1)[0],2);assert.equal(events.at(-1)[1],"Finished");
});

test("unconfirmed validated work keeps the workspace even after unexpected publication faults",async ()=>{
    const {job,app}=(await jobFixture("combined",{copyBeside: new Error("recovery denied")}));
    job.publication.link=()=>{throw new TypeError("bridge fault");};
    const result=(await runJob(job,[imageOf("/a/1.png")]));
    assert.equal(result.documents[0].state,"recovered");
    assert.equal(job.artifacts.size,1);
    assert.ok(!app.events.some(([event]) => event === "removeWorkspace"));
});

test("a default job has an inert progress capability, not a malformed sink",async ()=>{
    const app=createConversionFixture();
    const job=(await createJob(app.operations,settings,stamp,{tools,storage:app.storage,destinationNames:app.destinationNames}));
    job.progress.phase("Checking");assert.deepEqual(job.progress.diagnostics,[]);
});

async function longPathFixture() {
    const sources=Array.from({length:35},(unused,index)=>`/a/${index}.png`);
    const app=createConversionFixture({files:sources});
    const job=(await createJob(app.operations,settings,stamp,{tools,storage:app.storage,destinationNames:app.destinationNames}));
    Object.assign(job,{sources:app.sources,publication:app.publication,tools:{...tools,pdfcpu:"/opt/homebrew/Cellar/pdfcpu/0.16.4/bin/pdfcpu"}});
    job.workspace=`/${[246,246,246,245].map((width)=>"'".repeat(width)).join("/")}/ImageFilesToPDF.x`;
    const counts=[];const original=job.operations.run;
    job.operations.run=(command, label)=>{if(command.includes("thumbnail")){counts.push([...app.files.keys()].filter((path)=>path.endsWith("-page.jpg")).length);}return original(command, label);};
    return {app,job,counts,sources};
}

test("page staging stays bounded across imports with long paths",async ()=>{
    const {app,job,counts,sources}=(await longPathFixture());
    const result=(await runJob(job,sources.map(imageOf)));
    assert.equal(result.state,"complete");assert.ok(Math.max(...counts)<=32);
    const imports=app.commands.filter((command)=>command.includes("import"));
    assert.equal(imports.length,2);assert.ok(imports.every((command)=>command.reduce((bytes, argument) => bytes + Buffer.byteLength(argument) + 1, 0) <= 122880));
});

test("job accumulator outlives executor and workspace teardown faults",async ()=>{
    const vm=require("node:vm");const fs=require("node:fs");const {createRequire}=require("node:module");
    const jobPath=require.resolve("../../../src/application/job.js");const actualRequire=createRequire(jobPath);
    const module={exports:{}};
    vm.runInNewContext(fs.readFileSync(jobPath,"utf8"),{module,globalThis,require(name){
        if(name==="./documents.js"){return {executeDocuments(ports,plans,records){records.push({state:"saved",sources:["/a/1.png"],pages:1,output:"/saved.pdf",issues:[]});throw new TypeError("executor bug");}};}
        return actualRequire(name);
    }}, {filename:jobPath});
    const {job}=(await jobFixture("combined"));
    job.operations.removeWorkspace = () => { throw new Error("workspace teardown bug"); };
    const result=await module.exports.runJob(job,[imageOf("/a/1.png")]);
    assert.deepEqual([result.documents[0].output,Array.from(result.issues,issue=>issue.stage),result.state], ["/saved.pdf",["execution","cleanup"],"incomplete"]);
});


test("name-planning faults release the owned workspace before any PDF bytes",async ()=>{
    const {job,app}=(await jobFixture("separate"));
    job.destinationNames={groups(){throw new TypeError("namespace unavailable");}};
    const result=(await runJob(job,[imageOf("/a/1.png"),imageOf("/a/2.png")]));
    assert.equal(result.state,"incomplete");assert.deepEqual(result.documents,[]);
    assert.ok(result.issues.some(issue=>issue.code==="fault"));
    assert.ok(app.events.some(([event]) => event === "removeWorkspace"));
    assert.ok(!app.commands.some(command=>command.includes("thumbnail")));
});


test("actual PDF import, assembly, validation and publication clear image detail and new images restore their name", async () => {
    const phases = ["Creating PDF", "Assembling PDF", "Validating PDF", "Saving PDF"];
    for (const mode of ["combined", "separate"]) {
        // eslint-disable-next-line no-await-in-loop -- Settle and inspect this fixture before the next case.
        const { job, events } = (await jobFixture(mode));
        // eslint-disable-next-line no-await-in-loop -- Complete and inspect this fixture before the next case.
        assert.equal((await runJob(job, [imageOf("/a/1.png"), imageOf("/a/2.png")])).state, "complete");
        const documents = events.filter((event) => phases.includes(event[1]));
        assert.deepEqual(new Set(documents.map((event) => event[1])), new Set(phases));
        assert.ok(documents.every((event) => event[2] === ""), JSON.stringify(documents));
        for (const name of ["1.png", "2.png"]) {
            assert.ok(events.some((event) => event[1] === "Preparing" && event[2].endsWith(`— ${name}`)), name);
        }
    }
});

test("queue, validation and cleanup keep their progress and ownership boundaries", async () => {
    const { job, app, events } = (await jobFixture("combined"));
    const { run } = job.operations;
    const { write } = job.storage;
    let retained = false;
    job.storage.write = (path, text) => {
        assert.ok(path.endsWith("/retain"));
        assert.equal(text, "validating\n");
        retained = true;
        write(path, text);
    };
    job.operations.run = (argv, label) => {
        if (argv[1] === "validate") { assert.equal(retained, true); }
        return run(argv, label);
    };
    const outcome = (await runJob(job, [imageOf("/a/1.png")]));
    assert.equal(outcome.state, "complete");
    assert.ok(events.some(([done, description]) => done === 1 && description === "Prepared"));
    assert.deepEqual(outcome.issues, []);
    assert.deepEqual(outcome.documents[0].issues, []);
    assert.ok(app.events.some(([event]) => event === "removeWorkspace"));
});

test("capture and ordered encoding each have a Stop checkpoint and truthful progress", async () => {
    const { job, events } = await jobFixture("combined");
    const { capture } = job.sources;
    job.sources.capture = (from, to) => {
        events.push(["capture", from]);
        return capture(from, to);
    };
    job.operations.checkpoint = () => events.push(["checkpoint"]);
    const result = await runJob(job, [imageOf("/a/1.png")]);
    assert.equal(result.state, "complete");
    assert.deepEqual(events.slice(1, 7), [
        [0, "Capturing and checking images", ""],
        ["checkpoint"],
        ["capture", "/a/1.png"],
        ["source", 1, "1.png"],
        [0, "Preparing", "1 of 2 — 1.png"],
        ["checkpoint"]
    ]);
});

test("the initial setup reports prior workspace observations before showing a selection", async () => {
    const { execute } = require("../../../src/application/workflow.js");
    const { treeOf } = require("../ports/fake-tree.cjs");
    const { noImagesOutcome } = require("../../../src/core/outcomes.js");
    const host = createConversionFixture(), progress = createProgress([]);
    const observation = { code: "workspace-reclaimed", stage: "workspace", message: "A stale workspace was reclaimed." };
    const options = {
        operations: host.operations, checkTools: () => tools,
        capabilities: { tree: treeOf({}), sources: host.sources, publication: host.publication, storage: host.storage, destinationNames: host.destinationNames },
        reclaim: () => [observation], now: () => new Date(),
        interaction: { progress, collect: () => ({ inputItems: [] }), noImages: noImagesOutcome }
    };
    (await execute(null, options));
    assert.deepEqual(progress.diagnostics, [observation]);
});

test("a failed owned-page release stops before another native write and is included in diagnostics", async () => {
    const { job, app } = (await jobFixture());
    const prior = { code: "cleanup", stage: "cleanup", message: "A previously owned page could not be released." };
    job.cleanupIssues.push(prior);
    const result = await runJob(job, [imageOf("/a/1.png")]);
    assert.equal(result.documents[0].fatal, true);
    assert.deepEqual(result.diagnostics, [prior]);
    assert.ok(!app.commands.some((command) => command.includes("thumbnail")));
});

test("empty prepared output cannot reach import and is removed", async () => {
    const { job, app } = (await jobFixture());
    const {facts} = job.publication;
    job.publication.facts = (file) => file.endsWith("-page.png") ? { identity: "fixture-page", size: 0 } : facts(file);
    const result = await runJob(job, [imageOf("/a/1.png")]);
    assert.equal(result.documents[0].state, "failed");
    assert.match(result.documents[0].issues[0].message, /Page size is unknown/u);
    assert.ok(![...app.files.keys()].some((file) => file.endsWith("-page.png")));
    assert.ok(!app.commands.some((command) => command.includes("import")));
});

test("mandatory cleanup failure immediately before validation prevents the validator from writing", async () => {
    const { job, app } = (await jobFixture());
    const {write} = job.storage;
    const failure = { code: "cleanup", stage: "cleanup", message: "Pre-validation cleanup failed." };
    job.storage.write = (marker, content) => { write(marker, content); job.cleanupIssues.push(failure); };
    const result = await runJob(job, [imageOf("/a/1.png")]);
    assert.equal(result.documents[0].state, "failed");
    assert.ok(result.documents[0].issues.some((issue) => issue.message === failure.message));
    assert.ok(!app.commands.some((command) => command.includes("validate")));
});

test("a marker inspection fault remains visible and prevents workspace removal", async () => {
    const { job, app } = (await jobFixture());
    job.storage.entries = () => { throw new TypeError("Workspace marker inspection failed."); };
    const result = await runJob(job, []);
    assert.deepEqual(result.issues.map(({ code, stage, message }) => [code, stage, message]), [
        ["fault", "cleanup", "Workspace marker inspection failed."]
    ]);
    assert.ok(!app.events.some(([event]) => event === "removeWorkspace"));
});
