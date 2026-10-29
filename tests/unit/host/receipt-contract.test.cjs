"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {reportHeadless,reportNoImages,describeNoImages}=require("../../../src/host/reporting.js");
const {describeIncomplete,foundation}=require("../../../src/host/receipt.js");
const {runOutcome}=require("../../../src/core/outcomes.js");
const {completionMessage}=require("../../../src/host/completion.js");
const {createFakeObjC}=require("../ports/fake-objc.cjs");
const {createFakeApp}=require("../ports/fake-app.cjs");

const documents=[{state:"recovered",sources:["/bad.png"],pages:1,recovery:"/kept.pdf",issues:[{code:"publication",stage:"publication",message:"native refused",diagnostic:{command:"backend argv"}}]}];
const result={...runOutcome(documents,[{path:"bad",name:"bad",reason:"not supported"}],[{message:"setup issue"}]),elapsed:"1 second"};

test("headless incomplete output is one newline-terminated canonical receipt followed by a failing status",()=>{
    const lines=[];
    assert.throws(()=>reportHeadless(result,(text)=>lines.push(text)),(error)=>error.message==="The request was incomplete: 0 saved, 1 recovered, 1 refused.\n\nsetup issue\n\nnative refused\n{\"command\":\"backend argv\"}\n\n/kept.pdf");
    assert.deepEqual(lines,[`${JSON.stringify(result)}\n`]);
    assert.equal(describeIncomplete(result),"The request was incomplete: 0 saved, 1 recovered, 1 refused.\n\nsetup issue\n\nnative refused\n{\"command\":\"backend argv\"}\n\n/kept.pdf");
});

test("refusal-only receipts retain code, stage, request facts and explanation",()=>{
    const refused=[{path:"/a.gif",name:"a.gif",reason:"not supported"}];
    const receipt=reportNoImages({},true,refused);
    assert.deepEqual(receipt,{state:"incomplete",documents:[],rejected:refused,issues:[{code:"no-images",stage:"selection",message:"Nothing to convert.\n\nNot converted:\n/a.gif: not supported"}],diagnostics:[]});
    assert.equal(describeNoImages(refused),"Nothing to convert.\n\nNot converted:\n/a.gif: not supported");
});

test("completion keeps all outcome facts and explains bare issues without losing them",()=>{
    const value={...runOutcome([{state:"failed",sources:["/bad.png"],pages:0,issues:[{message:"damaged source"}]}]),elapsed:"1 second"};
    assert.equal(completionMessage(value),"0 PDFs saved; 0 PDFs recovered.\n\nRun incomplete.\n\nfailed\n/bad.png\ndamaged source\n\nElapsed: 1 second\n\nImage Files to PDF 1.5.4");
});

test("interactive no-images details use the bounded native renderer",()=>{
    const bridge=createFakeObjC();Object.assign(globalThis,{ObjC:bridge.objc,$:bridge.ns});
    assert.equal(reportNoImages(createFakeApp(),false,[{name:"bad",reason:"refused"}]),undefined);
    const [alert]=bridge.state.alerts;
    assert.equal(alert.messageText,"Image Files to PDF");assert.equal(alert.informativeText,"Nothing to convert.");
    assert.equal(alert.accessoryView.documentView.string,"Nothing to convert.\n\nNot converted:\nbad: refused");
    assert.deepEqual(alert.buttons,["OK"]);
});

test("stdout Foundation import uses the required framework",()=>{
    const imports=[];const ns={};assert.equal(foundation({import:(name)=>imports.push(name)},ns),ns);
    assert.deepEqual(imports,["Foundation"]);
});

test("source-level failures expose the responsible original pathname in the bounded detail",()=>{
    const value={...runOutcome([{state:"failed",sources:["/first.png","/bad.png"],pages:1,issues:[{source:"/bad.png",message:"damaged"}]}]),elapsed:"1 second"};
    assert.match(completionMessage(value),/Source: \/bad\.png\ndamaged/u);
});

test("full rejection paths distinguish repeated basenames and retain nonpath inputs",()=>{
    const {describeRejections}=require("../../../src/host/completion.js");
    assert.equal(describeRejections([{path:"/a/same.gif",name:"same.gif",reason:"unsupported"},{path:"/b/same.gif",name:"same.gif",reason:"unsupported"},{name:"original input",reason:"unreadable"}]),"Not converted:\n/a/same.gif: unsupported\n/b/same.gif: unsupported\noriginal input: unreadable");
});

test("completion exposes every rejection path and run issue in the bounded native detail",()=>{
    const {showCompletion}=require("../../../src/host/completion.js");const bridge=createFakeObjC();Object.assign(globalThis,{ObjC:bridge.objc,$:bridge.ns});
    const value={...runOutcome([{state:"saved",sources:["/ok.png"],pages:1,issues:[],output:"/saved.pdf"}],[{name:"same.gif",path:"/a/same.gif",reason:"unsupported"},{name:"same.gif",path:"/b/same.gif",reason:"unsupported"}],[{message:"request fault"}]),elapsed:"1 second"};
    showCompletion(createFakeApp(),value);
    const [alert]=bridge.state.alerts;
    assert.deepEqual(alert.buttons,["OK"]);assert.equal(alert.informativeText,"Run incomplete.");
    const detail=alert.accessoryView.documentView.string;
    assert.ok(["1 PDF saved; 0 PDFs recovered.","/saved.pdf","/a/same.gif: unsupported","/b/same.gif: unsupported","request fault"].every(text=>detail.includes(text)));
});
