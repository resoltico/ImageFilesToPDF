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
    assert.match(completion.accessoryView.documentView.string,/^1 saved\.$/mu);
});

test("interactive errors are presented and cancellation stays silent",()=>{
    const {state}=fixture({executables:[]});
    assert.equal(run([["/source.png"],{}]),undefined);
    assert.equal(state.alerts.length,1);
    const canceled=fixture();
    canceled.state.responses.push(1001);
    assert.equal(run([["/source.png"],{}]),undefined);
    assert.equal(canceled.state.alerts.length,1);
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
    assert.deepEqual([alert.messageText,alert.informativeText],["Image Files to PDF","A required tool is missing or unusable."]);
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
        const { reportNoImages } = require("../../../src/host/quick-action/reporting.js");
        const rejected=files.map((path)=>({path,reason:"unsupported"}));
        assert.equal(reportNoImages(context.app,rejected),undefined);
        const [alert]=context.state.alerts;
        const headline=files.length>0 ? "Nothing to convert." : "No images selected.";
        assert.equal(alert.informativeText,headline);
        const detail=alert.accessoryView.documentView.string;
        assert.ok(!detail.includes(headline));
        assert.match(detail,files.length>0 ? /notes\.txt/u : /Select image files or folders in Finder/u);
    }
});


test("Quick Action consent precedes settings and cancellation starts no conversion", () => {
    const accepted = fixture();
    assert.equal(run([["/source.png", "/notes.txt"], {}]), undefined);
    assert.equal(accepted.state.alerts.length, 3);
    assert.equal(accepted.state.alerts[0].informativeText, "1 item in your selection cannot be included.");
    assert.equal(accepted.state.alerts[1].informativeText, "Choose the page settings, then Create.");
    assert.equal(accepted.state.alerts[2].informativeText, "Created 1 PDF.");
    const canceled = fixture();
    canceled.state.responses.push(1001);
    assert.equal(run([["/source.png", "/notes.txt"], {}]), undefined);
    assert.equal(canceled.state.alerts.length, 1);
    assert.equal([...canceled.app.files].some((file) => file.endsWith(".pdf")), false);
    assert.equal(canceled.app.commands.some((command) => command.includes("'thumbnail'") && !command.includes("nonexistent-image")), false);
});

test("an unusable header probe is invalid setup with exit 3 before admission", () => {
    const { app, output, stderr } = fixture();
    app.headerProbe = "";
    assert.equal(run(["--headless", "/config", "/source.png"]), 3);
    const receipt = JSON.parse(output[0]);
    assert.equal(receipt.state, "invalid");
    assert.deepEqual(receipt.documents, []);
    assert.deepEqual(receipt.rejected, []);
    assert.equal(receipt.issues[0].stage, "setup");
    assert.match(stderr.join(""), /^A required tool is missing or unusable\./u);
});


test("CLI signal stop uses existing canceled state and monitor outlives receipt transport", () => {
    const signalController = require("../../../src/host/command-line/signal-controller.js");
    const context = fixture();
    let closed = false, polled = 0;
    signalController.createSignalController = () => ({ poll: () => { polled += 1; return true; }, close: () => { closed = true; } });
    context.ns.NSFileHandle.fileHandleWithStandardOutput.writeData = (text) => {
        assert.equal(closed, false);
        context.output.push(text);
    };
    assert.equal(run(["--headless", "/config", "/source.png"]), 1);
    const receipt = JSON.parse(context.output[0]);
    assert.equal(receipt.state, "canceled");
    assert.equal(receipt.issues[0].code, "canceled");
    assert.ok(polled > 0); assert.equal(closed, true);
    assert.equal([...context.app.files].some((path) => path.endsWith(".pdf")), false);
});

test("an exit failure remains primary if monitor cleanup also fails", () => {
    const signalController = require("../../../src/host/command-line/signal-controller.js");
    const context = fixture();
    const primary = new Error("exit stub failed");
    let closed = false;
    signalController.createSignalController = () => ({ poll: () => false, close() { closed = true; throw new Error("cleanup also failed"); } });
    context.ns.exit = () => { throw primary; };
    assert.throws(() => run(["--headless", "/config", "/source.png"]), (error) => error === primary);
    assert.equal(closed, true); assert.equal(context.output.length, 1);
});


test("a required monitor poll fault fails the run instead of disabling an optional observer", () => {
    const context = fixture();
    const signalController = require("../../../src/host/command-line/signal-controller.js");
    signalController.createSignalController = () => ({ poll: () => { throw new TypeError("required monitor failed"); }, close: () => undefined });
    assert.equal(run(["--headless", "/config", "/source.png"]), 3);
    const receipt = JSON.parse(context.output[0]);
    assert.equal(receipt.state, "incomplete"); assert.equal(receipt.issues[0].code, "fault");
    assert.equal(receipt.issues[0].message, "required monitor failed");
    assert.deepEqual(receipt.diagnostics, []);
});


test("failed native stdout preserves the human report and published PDF with one plain failure line", () => {
    const context = fixture();
    context.ns.NSFileHandle.fileHandleWithStandardOutput.writeData = () => { throw new Error("Bad file descriptor"); };
    assert.equal(run(["--headless", "/config", "/source.png"]), 1);
    assert.equal(context.output.length, 0);
    assert.match(context.stderr[0], /^Created 1 PDF/u);
    assert.equal(context.stderr[1], "Standard output could not be completed.\n");
    assert.ok([...context.app.files].some((path) => path.endsWith(".pdf")));
    for (const option of ["--help", "--version"]) {
        const help = fixture();
        help.ns.NSFileHandle.fileHandleWithStandardOutput.writeData = () => { throw new Error("Closed stdout"); };
        assert.equal(run([option]), 1); assert.deepEqual(help.stderr, ["Standard output could not be completed.\n"]);
    }
});
