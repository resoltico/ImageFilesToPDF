"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { run } = require("../../../src/entry.js");
const { createFakeHost } = require("./fake-host.cjs");
const { installPlatform } = require("./fake-platform.cjs");
const config = JSON.stringify({paperSize:"A4",orientation:"Portrait",mode:"single",dpi:72,quality:85,background:"#FFFFFF"});
function fixture(overrides={}) {
    const app=createFakeHost({files:["/source.png"],failures:[["'/bin/cat'",config]],...overrides});
    return { app, ...installPlatform(app) };
}

test("actual production entry returns one successful receipt and no runtime modules",()=>{
    const {output}=fixture();
    const result=run(["--headless","/config","/source.png"]);
    assert.equal(JSON.parse(result).state,"complete");
    assert.equal(output.length,0,"success uses the osascript return transport once");
});

test("entry writes one receipt before nonzero config failure",()=>{
    const {output}=fixture({failures:[["'/bin/cat'","{}"]]});
    assert.throws(()=>run(["--headless","/config","/source.png"]),/incomplete/u);
    assert.equal(output.length,1);
    assert.equal(JSON.parse(output[0]).issues.length,6);
});

test("entry setup fails closed when native capabilities are absent",()=>{
    const {output}=fixture();
    delete globalThis.ObjC;
    assert.throws(()=>run(["--headless","/config","/source.png"]),/incomplete/u);
    // stdout unavailable is an explicit transport limitation, never fabricated receipt evidence.
    assert.equal(output.length,0);
});

test("interactive Create produces no return value or stray text output",()=>{
    const {app,output,state}=fixture();
    assert.equal(run(["/source.png"]),undefined);
    assert.equal(output.length,0);
    assert.ok([...app.files].some((path)=>path.endsWith(".pdf")));
    assert.equal(state.alerts.length,2,"settings and completion");
});

test("interactive errors are presented and cancellation stays silent",()=>{
    const {state}=fixture({executables:[]});
    assert.equal(run(["/source.png"]),undefined);
    assert.equal(state.alerts.length,1);
    const cancelled=fixture();
    cancelled.state.responses.push(1001);
    assert.equal(run(["/source.png"]),undefined);
    assert.equal(cancelled.state.alerts.length,1);
});

test("separate mode and unmeasurable prepared pages produce truthful entry outcomes",()=>{
    const separate=JSON.stringify({paperSize:"A4",orientation:"Portrait",mode:"separate",dpi:72,quality:85,background:"#FFFFFF"});
    fixture({failures:[["'/bin/cat'",separate]]});
    assert.equal(JSON.parse(run(["--headless","/config","/source.png"])).state,"complete");
    const broken=fixture({failures:[["'/bin/cat'",config],["-page.jpg'",new Error("stat denied")]]});
    assert.throws(()=>run(["--headless","/config","/source.png"]));
    assert.equal(JSON.parse(broken.output[0]).documents[0].state,"failed");
});

test("a malformed configuration is a handled request error",()=>{
    const {output}=fixture({failures:[["'/bin/cat'","{"]]});
    assert.throws(()=>run(["--headless","/config","/source.png"]));
    assert.equal(JSON.parse(output[0]).issues[0].code,"operation");
});

test("entry activates Standard Additions and preserves setup receipt fields",()=>{
    const {app,output}=fixture({failures:[["'/bin/cat'","{}"]]});
    assert.throws(()=>run(["--headless","/config","/source.png"]));
    const receipt=JSON.parse(output[0]);
    assert.equal(app.includeStandardAdditions,true);assert.deepEqual(receipt.documents,[]);assert.deepEqual(receipt.rejected,[]);
    assert.equal(receipt.issues[0].stage,"settings");
});

test("setup failure closes every progress surface before presenting its structured diagnostic",()=>{
    const {state}=fixture({executables:[]});
    const closed=[];globalThis.Progress={get totalUnitCount(){return closed.at(-1);},set totalUnitCount(value){closed.push(value);}};
    assert.equal(run(["/source.png"]),undefined);
    const [alert]=state.alerts;
    assert.deepEqual([alert.messageText,alert.informativeText],["Image Files to PDF","The request could not be completed."]);
    assert.deepEqual(alert.buttons,["OK"]);
    assert.equal(JSON.parse(alert.accessoryView.documentView.string).issues[0].stage,"setup");
    assert.deepEqual(closed,[0]);delete globalThis.Progress;
});

test("the production controller reviews refusals before asking settings",()=>{
    const context=fixture({files:["/source.png","/notes.txt"]});context.state.responses.push(1000,1001);
    assert.equal(run(["/source.png","/notes.txt"]),undefined);
    assert.deepEqual(context.state.alerts[0].buttons,["Continue","Cancel"]);
    assert.match(context.state.alerts[0].accessoryView.documentView.string,/notes\.txt/u);
    assert.equal(context.state.alerts[1].messageText,"Image Files to PDF");
    assert.ok(![...context.app.files].some((path)=>path.endsWith(".pdf")));
});

test("a failed completion surface retains the saved outcome in its error report",()=>{
    const context=fixture();
    context.state.duringModal=(alert)=>{if(alert.informativeText==="Run complete."){throw new TypeError("completion view failed");}};
    assert.equal(run(["/source.png"]),undefined);
    const details=JSON.parse(context.state.alerts.at(-1).accessoryView.documentView.string);
    assert.equal(details.issues[0].stage,"reporting");assert.equal(details.outcome.documents[0].state,"saved");
    assert.ok(context.app.files.has(details.outcome.documents[0].output));
});
