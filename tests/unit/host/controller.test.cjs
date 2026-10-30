"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { execute } = require("../../../src/host/main.js");
const { createProgress } = require("../../../src/host/progress.js");
const { reportHeadless } = require("../../../src/host/reporting.js");
const { isCompleteSuccess } = require("../../../src/host/receipt.js");
const { createFakeHost } = require("../ports/fake-host.cjs");
const { treeOf } = require("../ports/fake-tree.cjs");
const settings = {paperSize:"A4",orientation:"Portrait",mode:"combined",resolutionLimit:72,quality:85,background:"#FFFFFF"};

function fixture(options = {}) {
    const app = createFakeHost({ files:["/source.png"], ...options });
    const caps = {storage:app.storage,destinationNames:app.destinationNames,tree:treeOf({}),sources:app.sources,publication:app.publication};
    return {app,caps};
}

test("controller converts through real adapters and derives a complete receipt", () => {
    const {app,caps}=fixture();
    const result=execute(app,{headless:true,settings,timestamp:"",inputItems:["/source.png"]},{headless:true,report:createProgress([]),capabilities:caps});
    assert.equal(result.state,"complete");
    assert.equal(result.documents[0].state,"saved");
    assert.equal(result.documents[0].pages,1);
    assert.equal(isCompleteSuccess(result),true);
    const lines=[]; assert.equal(reportHeadless(result,(text)=>lines.push(text),(code)=>code),0);
    assert.equal(JSON.parse(lines[0]).documents.length,1);
});

test("refused selection and conversion failures remain incomplete", () => {
    const {app,caps}=fixture({failures:[["'thumbnail'",new Error("damage")]]});
    const result=execute(app,{headless:true,settings,timestamp:"",inputItems:["/source.png","/notes.txt"]},{headless:true,report:createProgress([]),capabilities:caps});
    assert.equal(result.state,"incomplete");
    assert.equal(result.documents[0].state,"failed");
    assert.equal(result.rejected.length,1);
    const lines=[];
    assert.equal(reportHeadless(result,(text)=>lines.push(text),(code)=>code),1);
    assert.equal(lines.length,2);
    assert.equal(JSON.parse(lines[0]).documents[0].issues[0].stage,"preparation");
});

test("missing mandatory source capabilities refuse direct files at setup", () => {
    const {app,caps}=fixture();
    assert.throws(()=>execute(app,{headless:true,settings,timestamp:"",inputItems:["/source.png"]},{headless:true,report:createProgress([]),capabilities:{...caps,sources:null}}),/Required filesystem/u);
    assert.ok(!app.commands.some((command)=>command.includes("'thumbnail'") && !command.includes("nonexistent-image")));
});

test("no-image outcomes retain rejection facts", () => {
    const {app,caps}=fixture();
    const result=execute(app,{headless:true,settings,timestamp:"",inputItems:["/notes.txt"]},{headless:true,report:createProgress([]),capabilities:caps});
    assert.equal(result.state,"incomplete");
    assert.equal(result.documents.length,0);
    assert.equal(result.rejected.length,1);
});

test("interactive completion returns undefined and creates no text results", () => {
    const { reportResult }=require("../../../src/host/reporting.js");
    const app=createFakeHost();
    assert.equal(reportResult(app,{state:"complete",documents:[],rejected:[],issues:[],diagnostics:[],elapsed:"0 seconds"},{headless:false}),undefined);
});

test("empty selections explain how to select sources in both interfaces",()=>{
    const {describeNoImages,reportNoImages}=require("../../../src/host/reporting.js");
    assert.match(describeNoImages([]),/No images selected/u);
    const app=createFakeHost();
    assert.equal(reportNoImages(app,false,[]),undefined);
    assert.match(app.dialogs[0].message,/Finder/u);
    assert.equal(app.dialogs[0].message.split("No images selected.").length,2);
    const refused=[{path:"/notes.txt",reason:"unsupported"}];
    reportNoImages(app,false,refused);
    assert.equal(app.dialogs[1].message.split("Nothing to convert.").length,2);
    assert.match(app.dialogs[1].message,/notes\.txt: unsupported/u);
});

test("an unidentifiable selected source is refused before conversion",()=>{
    const {collectImageFiles}=require("../../../src/host/admission.js");
    const tree=treeOf({}, {}, {"/source.png":""});
    const result=collectImageFiles(createFakeHost({files:["/source.png"]}),["/source.png"],tree);
    assert.equal(result.images.length,0);
    assert.match(result.rejected[0].reason,/identified/u);
});

test("a combined pair exercises the backend command budget before import",()=>{
    const {app,caps}=fixture({files:["/source.png","/other.png"]});
    const result=execute(app,{headless:true,settings,timestamp:"",inputItems:["/source.png","/other.png"]},{headless:true,report:createProgress([]),capabilities:caps});
    assert.equal(result.documents[0].pages,2);
    assert.equal(result.state,"complete");
});

test("unknown staged page size fails before import and retains source",()=>{
    const {app,caps}=fixture();
    const {facts} = app.publication;
    app.publication.facts=(path)=>path.endsWith("-page.png")?{identity:"",size:-1}:facts(path);
    const result=execute(app,{headless:true,settings,timestamp:"",inputItems:["/source.png"]},{headless:true,report:createProgress([]),capabilities:caps});
    assert.equal(result.documents[0].state,"failed");
    assert.match(result.documents[0].issues[0].message,/Page size is unknown/u);
    assert.ok(app.files.has("/source.png"));
});

test("setup phases and the no-images branch close progress before a result can block",()=>{
    const {app,caps}=fixture();const events=[];
    const report={phase:(text)=>events.push(text),close:()=>events.push("closed"),diagnostics:[]};
    const result=execute(app,{headless:true,settings,timestamp:"",inputItems:["/notes.txt"]},{headless:true,report,capabilities:caps});
    assert.equal(result.state,"incomplete");
    assert.deepEqual(events,["Checking required tools","Finding images","closed"]);
});
