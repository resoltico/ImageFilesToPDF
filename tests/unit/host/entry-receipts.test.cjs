"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { run } = require("../../../src/entry.js");
const { createFakeHost } = require("../ports/fake-host.cjs");
const { installPlatform } = require("../ports/fake-platform.cjs");
const config = JSON.stringify({paperSize:"A4",orientation:"Portrait",mode:"combined",resolutionLimit:72,quality:85,background:"#FFFFFF"});
function fixture(overrides={}) {
    const { configuration = config, ...options } = overrides;
    const app=createFakeHost({files:["/source.png"],fileTexts:{"/config":configuration},...options});
    return { app, ...installPlatform(app) };
}

test("actual production entry returns one successful receipt and no runtime modules",()=>{
    const {output}=fixture();
    const result=run(["--headless","/config","/source.png"]);
    assert.equal(result,0);
    assert.equal(JSON.parse(output[0]).state,"complete");
    assert.equal(output.length,1);
});

test("entry writes one receipt before nonzero config failure",()=>{
    const {output}=fixture({configuration:"{}"});
    assert.equal(run(["--headless","/config","/source.png"]),2);
    assert.equal(output.length,1);
    assert.equal(JSON.parse(output[0]).issues.length,6);
});

test("entry setup fails closed when native capabilities are absent",()=>{
    const {output}=fixture();
    delete globalThis.ObjC;
    assert.throws(()=>run(["--headless","/config","/source.png"]),/ObjC/u);
    // stdout unavailable is an explicit transport limitation, never fabricated receipt evidence.
    assert.equal(output.length,0);
});

test("interactive Create produces no return value or stray text output",()=>{
    const {app,output,state}=fixture();
    assert.equal(run([["/source.png"],{}]),undefined);
    assert.equal(output.length,0);
    assert.ok([...app.files].some((path)=>path.endsWith(".pdf")));
    assert.equal(state.alerts.length,2,"settings and completion");
    const [,completion]=state.alerts;
    assert.equal(completion.informativeText,"Created 1 PDF.");
    assert.doesNotMatch(completion.accessoryView.documentView.string,/Created 1 PDF\./u);
    assert.match(completion.accessoryView.documentView.string,/1 PDF saved; 0 PDFs recovered; 0 PDFs failed\./u);
});

test("interactive errors are presented and cancellation stays silent",()=>{
    const {state}=fixture({executables:[]});
    assert.equal(run([["/source.png"],{}]),undefined);
    assert.equal(state.alerts.length,1);
    const cancelled=fixture();
    cancelled.state.responses.push(1001);
    assert.equal(run([["/source.png"],{}]),undefined);
    assert.equal(cancelled.state.alerts.length,1);
});

test("separate mode and unmeasurable prepared pages produce truthful entry outcomes",()=>{
    const separate=JSON.stringify({paperSize:"A4",orientation:"Portrait",mode:"separate",resolutionLimit:72,quality:85,background:"#FFFFFF"});
    const complete=fixture({configuration:separate});
    assert.equal(run(["--headless","/config","/source.png"]),0);
    assert.equal(JSON.parse(complete.output[0]).state,"complete");
    const broken=fixture({failures:[["-page.png'",new Error("stat denied")]]});
    run(["--headless","/config","/source.png"]);
    assert.equal(JSON.parse(broken.output[0]).documents[0].state,"failed");
});

test("a malformed configuration is a handled request error",()=>{
    const {output}=fixture({configuration:"{"});
    run(["--headless","/config","/source.png"]);
    assert.equal(JSON.parse(output[0]).issues[0].code,"settings-file");
});

test("entry activates Standard Additions and preserves setup receipt fields",()=>{
    const {app,output}=fixture({configuration:"{}"});
    run(["--headless","/config","/source.png"]);
    const receipt=JSON.parse(output[0]);
    assert.equal(app.includeStandardAdditions,false);assert.deepEqual(receipt.documents,[]);assert.deepEqual(receipt.rejected,[]);
    assert.equal(receipt.issues[0].stage,"settings");
});

test("setup failure closes every progress surface before presenting its structured diagnostic",()=>{
    const {state}=fixture({executables:[]});
    const closed=[];globalThis.Progress={get totalUnitCount(){return closed.at(-1);},set totalUnitCount(value){closed.push(value);}};
    assert.equal(run([["/source.png"],{}]),undefined);
    const [alert]=state.alerts;
    assert.deepEqual([alert.messageText,alert.informativeText],["Image Files to PDF","Finished with errors.\nNo PDF was created."]);
    assert.deepEqual(alert.buttons,["OK", "Details"]);
    assert.match(alert.accessoryView.documentView.string,/brew install vips pdfcpu/u);
    assert.doesNotMatch(alert.accessoryView.documentView.string,/diagnostic|stack/u);
    assert.deepEqual(closed,[]);delete globalThis.Progress;
});

test("the production controller reviews refusals before asking settings",()=>{
    const context=fixture({files:["/source.png","/notes.txt"]});context.state.responses.push(1000,1001);
    assert.equal(run([["/source.png","/notes.txt"],{}]),undefined);
    assert.deepEqual(context.state.alerts[0].buttons,["Continue","Cancel"]);
    assert.match(context.state.alerts[0].accessoryView.documentView.string,/notes\.txt/u);
    assert.equal(context.state.alerts[0].informativeText,"1 item in your selection cannot be included.");
    assert.doesNotMatch(context.state.alerts[0].accessoryView.documentView.string,/in your selection cannot be included/u);
    assert.equal(context.state.alerts[1].messageText,"Image Files to PDF");
    assert.ok(![...context.app.files].some((path)=>path.endsWith(".pdf")));
});

test("a failed completion surface retains the saved outcome in its error report",()=>{
    const context=fixture();
    context.state.duringModal=(alert)=>{if(alert.informativeText==="Created 1 PDF."){throw new TypeError("completion view failed");}};
    assert.equal(run([["/source.png"],{}]),undefined);
    const details=context.state.alerts.at(-1).accessoryView.documentView.string;
    assert.match(details,/completion view failed/u);
    assert.match(details,/Saved to:/u);
    assert.ok([...context.app.files].some((path)=>path.endsWith(".pdf")));
});


test("no-image native dialogs show one headline and retain actionable details",()=>{
    for(const files of [[],["/notes.txt"]]) {
        const context=fixture();
        const {reportNoImages}=require("../../../src/host/reporting.js");
        const rejected=files.map((path)=>({path,reason:"unsupported"}));
        assert.equal(reportNoImages(context.app,false,rejected),undefined);
        const [alert]=context.state.alerts;
        const headline=files.length>0 ? "Nothing to convert." : "No images selected.";
        assert.equal(alert.informativeText,headline);
        const detail=alert.accessoryView.documentView.string;
        assert.ok(!detail.includes(headline));
        assert.match(detail,files.length>0 ? /notes\.txt/u : /Select image files or folders in Finder/u);
    }
});
