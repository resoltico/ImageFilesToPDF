"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { execute: executeUseCase } = require("../../support/macos-conversion/host/main.js");
const { createProgress } = require("../../../src/application/progress.js");
const { createFakeHost } = require("../ports/fake-host.cjs");
const { treeOf } = require("../ports/fake-tree.cjs");

const { noImagesOutcome } = require("../../../src/core/outcomes.js");
function commandLineInteraction(invocation) {
    return { progress: createProgress([]), collect: () => invocation, settings: () => invocation.settings,
        noImages: noImagesOutcome, present: (result) => result };
}

async function execute(app, invocation, options) {
    const interaction = commandLineInteraction(invocation);
    interaction.progress = options.report;
    return (await executeUseCase(app, invocation, { interaction, capabilities: options.capabilities }));
}
const settings = {paperSize:"A4",orientation:"Portrait",mode:"combined",resolutionLimit:72,quality:85,background:"#FFFFFF"};

function fixture(options = {}) {
    const app = createFakeHost({ files:["/source.png"], ...options });
    const caps = {storage:app.storage,destinationNames:app.destinationNames,tree:treeOf({}),sources:app.sources,publication:app.publication};
    return {app,caps};
}

test("controller converts through real adapters and derives a complete receipt", async () => {
    const {app,caps}=fixture();
    const result=(await execute(app,{settings,timestamp:"",inputItems:["/source.png"]},{report:createProgress([]),capabilities:caps}));
    assert.equal(result.state,"complete");
    assert.equal(result.documents[0].state,"saved");
    assert.equal(result.documents[0].pages,1);
});

test("refused selection and conversion failures remain incomplete", async () => {
    const {app,caps}=fixture({failures:[["'thumbnail'",new Error("damage")]]});
    const result=(await execute(app,{settings,timestamp:"",inputItems:["/source.png","/notes.txt"]},{report:createProgress([]),capabilities:caps}));
    assert.equal(result.state,"incomplete");
    assert.equal(result.documents[0].state,"failed");
    assert.equal(result.rejected.length,1);
});

test("missing mandatory source capabilities refuse direct files at setup", async () => {
    const {app,caps}=fixture();
    await assert.rejects(()=>execute(app,{settings,timestamp:"",inputItems:["/source.png"]},{report:createProgress([]),capabilities:{...caps,sources:null}}),/Required filesystem/u);
    assert.ok(!app.commands.some((command)=>command.includes("'thumbnail'") && !command.includes("nonexistent-image")));
});

test("no-image outcomes retain rejection facts", async () => {
    const {app,caps}=fixture();
    const result=(await execute(app,{settings,timestamp:"",inputItems:["/notes.txt"]},{report:createProgress([]),capabilities:caps}));
    assert.equal(result.state,"incomplete");
    assert.equal(result.documents.length,0);
    assert.equal(result.rejected.length,1);
});

test("interactive completion returns undefined and creates no text results", () => {
    const { reportResult } = require("../../../src/finder/quick-action/reporting.js");
    const app=createFakeHost();
    assert.equal(reportResult(app,{state:"complete",documents:[],rejected:[],issues:[],diagnostics:[],elapsed:"0 seconds"}),undefined);
});

test("empty selections explain how to select sources in both interfaces",()=>{
    const { reportNoImages } = require("../../../src/finder/quick-action/reporting.js");
const { describeNoImages } = require("../../../src/core/run-report.js");
    assert.match(describeNoImages([]),/No images selected/u);
    const app=createFakeHost();
    assert.equal(reportNoImages(app,[]),undefined);
    assert.match(app.dialogs[0].message,/Finder/u);
    assert.equal(app.dialogs[0].message.split("No images selected.").length,2);
    const refused=[{path:"/notes.txt",reason:"unsupported"}];
    reportNoImages(app,refused);
    assert.equal(app.dialogs[1].message.split("Nothing to convert.").length,2);
    assert.match(app.dialogs[1].message,/notes\.txt: unsupported/u);
});

test("an unidentifiable selected source is refused before conversion",async ()=>{
    const {collectImageFiles}=require("../ports/fake-selection.cjs");
    const tree=treeOf({}, {}, {"/source.png":""});
    const result=(await collectImageFiles(createFakeHost({files:["/source.png"]}),["/source.png"],tree));
    assert.equal(result.images.length,0);
    assert.deepEqual([result.rejected[0].code,result.rejected[0].reason],["unexaminable","This item could not be examined."]);
});

test("a combined pair exercises the backend command budget before import",async ()=>{
    const {app,caps}=fixture({files:["/source.png","/other.png"]});
    const result=(await execute(app,{settings,timestamp:"",inputItems:["/source.png","/other.png"]},{report:createProgress([]),capabilities:caps}));
    assert.equal(result.documents[0].pages,2);
    assert.equal(result.state,"complete");
});

test("unknown staged page size fails before import and retains source",async ()=>{
    const {app,caps}=fixture();
    const {facts} = app.publication;
    app.publication.facts=(path)=>path.endsWith("-page.png")?{identity:"",size:-1}:facts(path);
    const result=(await execute(app,{settings,timestamp:"",inputItems:["/source.png"]},{report:createProgress([]),capabilities:caps}));
    assert.equal(result.documents[0].state,"failed");
    assert.match(result.documents[0].issues[0].message,/Page size is unknown/u);
    assert.ok(app.files.has("/source.png"));
});

test("setup phases and the no-images branch close progress before a result can block",async ()=>{
    const {app,caps}=fixture();const events=[];
    const report={phase:(text)=>events.push(text),close:()=>events.push("closed"),diagnostics:[]};
    const result=(await execute(app,{settings,timestamp:"",inputItems:["/notes.txt"]},{report,capabilities:caps}));
    assert.equal(result.state,"incomplete");
    assert.deepEqual(events,["Checking required tools","Finding images","closed"]);
});

test("elapsed measures processing and excludes time spent choosing settings", async (context) => {
    context.mock.timers.enable({ apis: ["Date"], now: 0 });
    const { app, caps } = fixture({ failures: [["'thumbnail'", (command) => {
        if (!command.includes("nonexistent-image")) { context.mock.timers.tick(1000); }
        return undefined;
    }]] });
    const invocation = { settings, timestamp: "20261029_010203", inputItems: ["/source.png"] };
    const interaction = commandLineInteraction(invocation);
    interaction.settings = () => { context.mock.timers.tick(120000); return settings; };
    const result = (await executeUseCase(app, invocation, { interaction, capabilities: caps }));
    assert.equal(result.state, "complete");
    assert.equal(result.elapsed, "1 second");
    assert.equal(Date.now(), 121000);
});
