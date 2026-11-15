"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const { runOutcome, issuesOf }=require("../../../src/core/outcomes.js");
const { sourceIssues }=require("../../../src/core/source-policy.js");
const { completionMessage }=require("../../../src/host/quick-action/completion.js");
const { showDetails,detailPages }=require("../../../src/host/quick-action/details-dialog.js");
const { writeReceipt,foundation }=require("../../../src/host/command-line/receipt.js");
const { createFakeObjC }=require("../ports/fake-objc.cjs");
const { createFakeApp }=require("../ports/fake-app.cjs");

function assertOutcomeText(message) {
    assert.match(message,/1 saved; 1 recovered/u);
    assert.match(message,/\/recovery\/b\.pdf/u);
    assert.match(message,/Not started: 1/u);
    assert.doesNotMatch(message,/backend command/u);
    assert.doesNotMatch(message,/observer-fault/u);
}

test("recovery and prepared pages cannot be mistaken for publication",()=>{
    const documents=[{state:"saved",sources:["a"],pages:1,output:"/out/a.pdf",issues:[]},
        {state:"recovered",sources:["b"],pages:1,recovery:"/recovery/b.pdf",issues:[{code:"publication",message:"denied",diagnostic:{command:"backend command"}}]},
        {state:"failed",sources:["c"],pages:0,issues:[]},
        {state:"not-started",sources:["d"],pages:0,issues:[]}];
    const result={...runOutcome(documents,[{name:"link",reason:"refused"}],[{message:"setup"}]),elapsed:"3 seconds"};
    result.diagnostics.push({code:"observer-fault",message:"optional progress"});
    const message=completionMessage(result);
    assertOutcomeText(message);
    assert.match(message,/Not included from your selection:/u);
    assert.match(message,/^1 saved; 1 recovered; 1 failed; 1 not started; 1 not included\.$/mu);
    assert.match(message,/Elapsed: 3 seconds\n\nImage Files to PDF \S+$/u, "the dialog ends with elapsed time, then the version");
});

test("source policy fails closed for unknown formats and counts",()=>{
    assert.equal(sourceIssues({format:"SVG",pages:1})[0].code,"not-an-image");
    for(const pages of [undefined,0,-1,1.5]) { assert.equal(sourceIssues({format:"PNG",width:400,height:200,bands:3,orientation:1,pages})[0].code,"damaged"); }
    assert.equal(sourceIssues({format:"PNG",width:400,height:200,bands:3,orientation:1,pages:2})[0].code,"multiple-images");
    assert.deepEqual(sourceIssues({format:"PNG",width:400,height:200,bands:3,orientation:1,pages:1}),[]);
    assert.equal(issuesOf(new ReferenceError("fault"),"test")[0].code,"fault");
    assert.equal(issuesOf({message:"ordinary"},"test")[0].diagnostic.stack,"");
});

test("full details are bounded and accessible through native and paged fallback surfaces",()=>{
    const text=`long path ${"a".repeat(10000)}`;
    const pages=detailPages(text);
    assert.ok(pages.length>1);
    assert.equal(pages.join("").replaceAll("\n",""),text);
    assert.ok(pages.every((page)=>page.split("\n").length<=14));
    const app=createFakeApp();
    assert.equal(showDetails(app,{title:"Review",summary:"Review",detail:"Native details",fallbackDetail:text,buttons:["Continue","Cancel"]},null),0);
    assert.equal(app.dialogs.length,pages.length);
    assert.equal(showDetails({displayDialog:()=>({buttonReturned:"Cancel"})},{title:"Review",detail:"short",buttons:["Continue","Cancel"]},null),1);
});

test("native details preserve selectable text and action response",()=>{
    const bridge=createFakeObjC({responses:[1001]});
    assert.equal(showDetails({}, {title:"Review",summary:"Summary",detail:"Full /path",buttons:["Continue","Cancel"]},bridge),1);
    const [alert]=bridge.state.alerts;
    assert.equal(alert.informativeText,"Summary");
    assert.equal(alert.accessoryView.documentView.string,"Full /path");
    assert.equal(alert.accessoryView.documentView.selectable,true);
});

test("stdout transport reports presence truthfully",()=>{
    assert.equal(foundation(null,null),null);
    assert.equal(foundation({import:()=>true},null),null);
    assert.equal(writeReceipt("receipt",null),false);
    const written=[];
    const ns=(text)=>({dataUsingEncoding:()=>text});
    ns.NSFileHandle={fileHandleWithStandardOutput:{writeData:(text)=>written.push(text)}};
    assert.equal(foundation({import:()=>true},ns),ns);
    const brokenPipe = require("../../../src/host/command-line/broken-pipe.js");
    const { withoutSigpipe } = brokenPipe;
    try { brokenPipe.withoutSigpipe = (write) => write(); assert.equal(writeReceipt("receipt\n",ns),true); }
    finally { brokenPipe.withoutSigpipe = withoutSigpipe; }
    assert.deepEqual(written,["receipt\n"]);
});

function assertDetailBehavior(view) {
    assert.equal(view.string,"abc");
    assert.deepEqual([view.editable,view.selectable,view.richText,view.drawsBackground,view.verticallyResizable,view.horizontallyResizable],[false,true,false,false,true,false]);
    assert.deepEqual(view.textContainer,{containerSize:{width:455,height:1000000},widthTracksTextView:true});
}

test("native detail fields preserve selection, wrapping and scroll behavior",()=>{
    const bridge=createFakeObjC();
    showDetails({}, {title:"Title",summary:"Summary",detail:"abc",buttons:["OK"]},bridge);
    const [alert]=bridge.state.alerts;const view=alert.accessoryView.documentView;
    assert.deepEqual(alert.buttons,["OK"]);assert.equal(alert.messageText,"Title");assert.equal(alert.informativeText,"Summary");
    assert.equal(alert.accessoryView.hasVerticalScroller,true);assert.equal(alert.accessoryView.autohidesScrollers,false);
    assertDetailBehavior(view);

});

test("bounded fallback pages preserve exact boundaries and action semantics",()=>{
    assert.deepEqual(detailPages(""),[""]);
    assert.deepEqual(detailPages("a".repeat(78)),["a".repeat(78)]);
    assert.deepEqual(detailPages(Array(14).fill("a").join("\n")),[Array(14).fill("a").join("\n")]);
    const app=createFakeApp();showDetails(app,{title:"Title",detail:"a".repeat(1200),buttons:["OK"]},null);
    assert.equal(app.dialogs[0].options.cancelButton,undefined);
    assert.deepEqual(app.dialogs[0].options.buttons,["Next"]);
    assert.deepEqual(app.dialogs.at(-1).options.buttons,["OK"]);
});

test("a native modal-unavailable response uses bounded host detail pages without masking faults",()=>{
    const app=createFakeApp();const bridge=createFakeObjC({responses:[-1001]});
    assert.equal(showDetails(app,{title:"Review",summary:"Summary",detail:"Full details",buttons:["Continue","Cancel"]},bridge),0);
    assert.equal(app.dialogs[0].message,"Full details");assert.deepEqual(app.dialogs[0].options.buttons,["Cancel","Continue"]);
});


test("paged completion keeps every final action and its original response index",()=>{
    const spec={title:"Completion",summary:"Created 1 PDF.",detail:"Saved paths",fallbackDetail:"Created 1 PDF.\n\nSaved paths",buttons:["OK","Show in Finder","Details"]};
    for(const [index,button] of spec.buttons.entries()) {
        const seen=[];
        const app={displayDialog:(message,options)=>{seen.push({message,options});return {buttonReturned:button};}};
        assert.equal(showDetails(app,spec,null),index);
        const [dialog]=seen;
        assert.deepEqual(dialog.options.buttons,["Show in Finder","Details","OK"]);
        assert.equal(dialog.options.defaultButton,"OK");
        assert.equal(dialog.options.cancelButton,undefined);
        assert.equal(dialog.message.split("Created 1 PDF.").length,2);
    }
    const seen=[];
    const app={displayDialog:(message,options)=>{seen.push(options);return {buttonReturned:options.defaultButton};}};
    assert.equal(showDetails(app,{...spec,fallbackDetail:"a".repeat(1200)},null),0);
    assert.deepEqual(seen[0].buttons,["Details","Next"]);
    assert.deepEqual(seen.at(-1).buttons,["Show in Finder","Details","OK"]);
});

test("modal details reset once after visible layout and never fight later scrolling", () => {
    const bridge = createFakeObjC();
    bridge.state.duringModal = (alert) => {
        const [token] = bridge.state.observers;
        token.callback();
        assert.equal(alert.layoutPasses, 1, "hidden updates do not consume initialization");
        alert.window.visible = true;
        token.callback();
        assert.equal(alert.layoutPasses, 2);
        assert.deepEqual(bridge.state.observers, [], "remove before reset can cause a reentrant update");
        alert.accessoryView.contentView.scrollToPoint({ left: 0, top: 34 });
        token.callback();
        assert.deepEqual(alert.accessoryView.scrolledTo, { left: 0, top: 34 });
    };
    showDetails({}, { title: "Details", summary: "Summary", detail: "Long content", buttons: ["OK"] }, bridge);
    assert.deepEqual(bridge.state.observers, []);
});

test("modal initializer faults unwind the modal and retain their original error", () => {
    const bridge = createFakeObjC();
    const failure = new TypeError("late layout failed");
    bridge.state.duringModal = (alert) => {
        alert.window.visible = true;
        alert.accessoryView.documentView.scrollRangeToVisible = () => { throw failure; };
        bridge.state.observers[0].callback();
    };
    assert.throws(() => showDetails({}, { title: "Details", detail: "text", buttons: ["OK"] }, bridge), (error) => error === failure);
    assert.equal(bridge.state.aborted, 1);
    assert.deepEqual(bridge.state.observers, []);
    const broken = createFakeObjC({ duringModal() { throw failure; } });
    assert.throws(() => showDetails({}, { title: "Details", detail: "text", buttons: ["OK"] }, broken), (error) => error === failure);
    assert.deepEqual(broken.state.observers, []);
});

test("an abort failure cannot throw across the native block or mask the layout fault", () => {
    const bridge = createFakeObjC({ abortFailure: new Error("abort failed") });
    const primary = new TypeError("layout failed");
    bridge.state.duringModal = (alert) => {
        alert.window.visible = true;
        alert.accessoryView.documentView.scrollRangeToVisible = () => { throw primary; };
        assert.doesNotThrow(() => bridge.state.observers[0].callback());
    };
    assert.throws(() => showDetails({}, { title: "Details", detail: "text", buttons: ["OK"] }, bridge), (error) => error === primary);
    assert.deepEqual(bridge.state.observers, []);
});

test("the visible getter cannot recursively enter the native notification boundary", () => {
    const bridge = createFakeObjC();
    let reads = 0;
    bridge.state.duringModal = (alert) => {
        const [token] = bridge.state.observers;
        Object.defineProperty(alert.window, "visible", { get() {
            reads += 1;
            assert.equal(reads, 1, "a second native getter is the unguarded recursion negative control");
            token.callback();
            return true;
        } });
        assert.doesNotThrow(() => token.callback());
        assert.equal(alert.layoutPasses, 2);
        token.callback();
        assert.equal(reads, 1);
    };
    showDetails({}, { title: "Details", detail: "text", buttons: ["OK"] }, bridge);
    assert.deepEqual(bridge.state.observers, []);
});

test("registration and teardown notifications cannot read native visibility", () => {
    const bridge = createFakeObjC();
    const center = bridge.ns.NSNotificationCenter.defaultCenter;
    const add = center.addObserverForNameObjectQueueUsingBlock;
    const remove = center.removeObserver;
    let reads = 0;
    center.addObserverForNameObjectQueueUsingBlock = (name, window, queue, callback) => {
        Object.defineProperty(window, "visible", { get() { reads += 1; throw new Error("must not query outside modal"); } });
        const token = add(name, window, queue, callback);
        callback();
        return token;
    };
    center.removeObserver = (token) => { token.callback(); remove(token); };
    assert.equal(showDetails({}, { title: "Details", detail: "text", buttons: ["OK"] }, bridge), 0);
    assert.equal(reads, 0);
    assert.equal(bridge.state.aborted, 0);
    assert.deepEqual(bridge.state.observers, []);
});
