"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {runOutcome,issuesOf}=require("../../../src/core/outcomes.js");
const {UserCancelled,OperationError}=require("../../../src/core/errors.js");
const saved={state:"saved",sources:["a"],pages:1,output:"/a.pdf",issues:[]};
const failed={state:"failed",sources:["b"],pages:0,issues:[]};

test("outcome defaults and refusal/failure/stop states are one canonical record",()=>{
    assert.deepEqual(runOutcome(),{state:"incomplete",documents:[],rejected:[],issues:[],diagnostics:[]});
    assert.deepEqual(runOutcome([saved]),{state:"complete",documents:[saved],rejected:[],issues:[],diagnostics:[]});
    assert.equal(runOutcome([saved,failed]).state,"incomplete");
    assert.equal(runOutcome([saved],[{path:"bad"}]).state,"incomplete");
    assert.equal(runOutcome([saved],[],[{code:"setup"}]).state,"incomplete");
});

test("cancellation is explicit and recovery never means publication",()=>{
    const recovered={state:"recovered",sources:["b"],pages:1,recovery:"/kept.pdf",issues:[{code:"cancelled"},{code:"operation"}]};
    assert.equal(runOutcome([saved,recovered]).state,"cancelled");
    assert.equal(runOutcome([saved,{...failed,state:"cancelled"}]).state,"cancelled");
    assert.equal(runOutcome([saved,{...recovered,issues:[{code:"publication"}]}]).state,"incomplete");
});

test("expected errors, stops, unknown faults and provided issues retain their diagnostic kind",()=>{
    const stop=new UserCancelled();
    assert.equal(issuesOf(stop,"inspection")[0].code,"cancelled");
    assert.equal(issuesOf(new OperationError("denied"),"capture")[0].code,"operation");
    assert.equal(issuesOf(new Error("bug"),"publication")[0].code,"fault");
    assert.deepEqual(issuesOf({message:"bad"},"prepare"),[{code:"fault",stage:"prepare",message:"bad",diagnostic:{command:"",stack:""}}]);
    const issues=[{field:"resolutionLimit",code:"integer"}];
    assert.equal(issuesOf({issues},"setup"),issues);
});

test("unexpected null faults and wrapped programming faults remain identifiable",()=>{
    for(const error of [null,undefined]){
        assert.deepEqual(issuesOf(error,"publication"),[{code:"fault",stage:"publication",message:"Unknown error",diagnostic:{command:"",stack:""}}]);
    }
    for(const cause of [new TypeError("bug"),new ReferenceError("bug")]){
        assert.equal(issuesOf(new OperationError("command",{cause}),"prepare")[0].code,"fault");
    }
});

test("malformed supplied issues stay software faults instead of breaking the outcome boundary",()=>{
    for(const issues of [null,{},[],[null],[{}]]){
        const error=new OperationError("invalid issues");error.issues=issues;
        assert.equal(issuesOf(error,"publication")[0].code,"fault");
    }
});

test("a handled setup stop is cancelled even before a document plan exists",()=>{
    assert.equal(runOutcome([],[],[{code:"cancelled",stage:"setup",message:"Stopped"}]).state,"cancelled");
});

test("reporting faults retain saved documents and late cancellation invents no unfinished work",()=>{
    const {failedRun}=require("../../../src/core/outcomes.js");const outcome=runOutcome([saved]);
    const failedResult=failedRun(new TypeError("view failed"),outcome);
    assert.equal(failedResult.state,"incomplete");assert.deepEqual(failedResult.documents,[saved]);assert.equal(failedResult.issues[0].stage,"reporting");
    assert.equal(failedRun(new UserCancelled(),outcome),outcome);
});

test("saved documents with recorded failures preserve output paths but make the run incomplete",()=>{
    const record={...saved,issues:[{code:"fault",stage:"cleanup",message:"teardown failed"}]};
    const result=runOutcome([saved,record]);
    assert.equal(result.state,"incomplete");assert.equal(result.documents[1].output,"/a.pdf");
});
