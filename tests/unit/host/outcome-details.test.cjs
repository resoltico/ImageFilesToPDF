"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const { runOutcome, issuesOf }=require("../../../src/core/outcomes.js");
const { sourceIssues }=require("../../../src/core/source-policy.js");
const { completionMessage }=require("../../../src/host/completion.js");
const { showDetails,detailPages }=require("../../../src/host/details-dialog.js");
const { writeReceipt,foundation,describeIncomplete }=require("../../../src/host/receipt.js");
const { createFakeObjC }=require("../ports/fake-objc.cjs");
const { createFakeApp }=require("../ports/fake-app.cjs");

function assertOutcomeText(message) {
    assert.match(message,/1 PDF saved; 1 PDF recovered/u);
    assert.match(message,/\/recovery\/b\.pdf/u);
    assert.match(message,/not-started/u);
    assert.match(message,/backend command/u);
    assert.match(message,/observer-fault/u);
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
    assert.match(describeIncomplete(result),/1 saved, 1 recovered, 1 refused/u);
});

test("source policy fails closed for unknown formats and counts",()=>{
    assert.equal(sourceIssues({format:"SVG",pages:1})[0].code,"source-format");
    for(const pages of [undefined,0,-1,1.5]) { assert.equal(sourceIssues({format:"PNG",pages})[0].code,"source-count"); }
    assert.equal(sourceIssues({format:"PNG",pages:2})[0].code,"source-multiple");
    assert.deepEqual(sourceIssues({format:"PNG",pages:1}),[]);
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
    assert.equal(showDetails(app,{title:"Review",summary:"Review",detail:text,buttons:["Continue","Cancel"]},null),0);
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
    assert.equal(writeReceipt("receipt\n",ns),true);
    assert.deepEqual(written,["receipt\n"]);
});

function assertDetailBehavior(view) {
    assert.equal(view.string,"abc");
    assert.deepEqual([view.editable,view.selectable,view.richText,view.drawsBackground,view.verticallyResizable,view.horizontallyResizable],[false,true,false,false,true,false]);
    assert.deepEqual(view.textContainer,{containerSize:{width:470,height:1000000},widthTracksTextView:true});
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
