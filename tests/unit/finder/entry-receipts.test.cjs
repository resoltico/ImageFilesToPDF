"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { runQuickAction } = require("../../../src/finder/quick-action/main.js");
const { collectInvocation } = require("../../../src/finder/quick-action/input.js");
const { reportResult, reportNoImages } = require("../../../src/finder/quick-action/reporting.js");
const { reviewSelection } = require("../../../src/finder/quick-action/settings-review.js");
const { chooseSettings } = require("../../../src/finder/quick-action/settings-form.js");
const { createFakeApp } = require("../ports/fake-app.cjs");
const { createFakeObjC } = require("../ports/fake-objc.cjs");

function fixture({ executables } = {}) {
    const app = createFakeApp();
    const bridge = createFakeObjC();
    Object.assign(globalThis, { ObjC: bridge.objc, $: bridge.ns });
    const events = [];
    const receipt = (documents = [], issues = []) => ({ state: issues.length > 0 ? "setup-failed" : "complete", documents, issues, rejected: [], diagnostics: [] });
    const ports = {
        application: () => app,
        openProgress: () => ({ diagnostics: [], pause: () => undefined, close() { events.push("closed"); } }),
        collect: collectInvocation, review: reviewSelection, settings: chooseSettings,
        result(host, outcome) { events.push("result"); return reportResult(host, outcome); },
        runEngine(items, hooks) {
            if (executables?.length === 0) { return receipt([], [{ code: "tool-missing", stage: "setup", message: "A required tool was unavailable.", diagnostic: { message: "Probe failed." } }]); }
            const files = items.filter((item) => item.endsWith(".png"));
            const rejected = items.filter((item) => !files.includes(item)).map((path) => ({ path, name: path.slice(1), reason: "Unsupported." }));
            const context = { count: files.length, rejected, destinations: ["/"], selection: files };
            if (rejected.length > 0) { hooks.review(context); }
            hooks.settings(context);
            events.push("converted");
            return receipt([{ state: "saved", sources: files, output: "/source.pdf", pages: 1, issues: [] }]);
        }
    };
    return { ...bridge, app, events, run: (input) => runQuickAction(input, ports) };
}

test("interactive Create produces no return value or stray text output",async ()=>{
    const {events,run,state}=fixture();
    assert.equal((await run([["/source.png"],{}])),undefined);
    assert.deepEqual(events, ["converted", "closed", "result"]);
    assert.equal(state.alerts.length,2,"settings and completion");
    const [,completion]=state.alerts;
    assert.equal(completion.informativeText,"Created 1 PDF.");
    assert.doesNotMatch(completion.accessoryView.documentView.string,/Created 1 PDF\./u);
    assert.match(completion.accessoryView.documentView.string,/^1 saved\.$/mu);
});

test("interactive errors are presented and cancellation stays silent",async ()=>{
    const {state,run}=fixture({executables:[]});
    assert.equal((await run([["/source.png"],{}])),undefined);
    assert.equal(state.alerts.length,1);
    const canceled=fixture();
    canceled.state.responses.push(1001);
    assert.equal((await canceled.run([["/source.png"],{}])),undefined);
    assert.equal(canceled.state.alerts.length,1);
});




test("setup failure closes every progress surface before presenting its structured diagnostic",async ()=>{
    const {state,run,events}=fixture({executables:[]});
    const closed=[];globalThis.Progress={get totalUnitCount(){return closed.at(-1);},set totalUnitCount(value){closed.push(value);}};
    assert.equal((await run([["/source.png"],{}])),undefined);
    const [alert]=state.alerts;
    assert.deepEqual([alert.messageText,alert.informativeText],["Image Files to PDF","Setup failed."]);
    assert.deepEqual(alert.buttons,["OK", "Details"]);
    assert.match(alert.accessoryView.documentView.string,/A required tool was unavailable/u);
    assert.deepEqual(events, ["closed", "result"]);
    assert.doesNotMatch(alert.accessoryView.documentView.string,/diagnostic|stack/u);
    assert.deepEqual(closed,[]);delete globalThis.Progress;
});

test("the production controller reviews refusals before asking settings",async ()=>{
    const context=fixture({files:["/source.png","/notes.txt"]});context.state.responses.push(1000,1001);
    assert.equal((await context.run([["/source.png","/notes.txt"],{}])),undefined);
    assert.deepEqual(context.state.alerts[0].buttons,["Continue","Cancel"]);
    assert.match(context.state.alerts[0].accessoryView.documentView.string,/notes\.txt/u);
    assert.equal(context.state.alerts[0].informativeText,"1 item in your selection cannot be included.");
    assert.doesNotMatch(context.state.alerts[0].accessoryView.documentView.string,/in your selection cannot be included/u);
    assert.equal(context.state.alerts[1].messageText,"Image Files to PDF");
    assert.ok(!context.events.includes("converted"));
});

test("a failed completion surface retains the saved outcome in its error report",async ()=>{
    const context=fixture();
    context.state.duringModal=(alert)=>{if(alert.informativeText==="Created 1 PDF."){throw new TypeError("completion view failed");}};
    assert.equal((await context.run([["/source.png"],{}])),undefined);
    const details=context.state.alerts.at(-1).accessoryView.documentView.string;
    assert.match(details,/completion view failed/u);
    assert.match(details,/Saved to:/u);
    assert.equal(context.events.filter((event) => event === "converted").length, 1);
});


test("no-image native dialogs show one headline and retain actionable details",()=>{
    for(const files of [[],["/notes.txt"]]) {
        const context=fixture();
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


test("Quick Action consent precedes settings and cancellation starts no conversion", async () => {
    const accepted = fixture();
    assert.equal((await accepted.run([["/source.png", "/notes.txt"], {}])), undefined);
    assert.equal(accepted.state.alerts.length, 3);
    assert.equal(accepted.state.alerts[0].informativeText, "1 item in your selection cannot be included.");
    assert.equal(accepted.state.alerts[1].informativeText, "Choose the page settings, then Create.");
    assert.equal(accepted.state.alerts[2].informativeText, "Created 1 PDF.");
    const canceled = fixture();
    canceled.state.responses.push(1001);
    assert.equal((await canceled.run([["/source.png", "/notes.txt"], {}])), undefined);
    assert.equal(canceled.state.alerts.length, 1);
    assert.equal(canceled.events.includes("converted"), false);
});
