"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {hostError}=require("../../../src/runtime/cancellation.js");
const {isUserCancelled,commandOf}=require("../../../src/core/errors.js");

test("host cancellation preserves the underlying cause and command through contextual wrappers",()=>{
    const native=Object.assign(new Error("native stop"),{errorNumber:-128,command:"native command"});
    const wrapped=new Error("context",{cause:native});const translated=hostError(wrapped);
    assert.equal(translated.cause,wrapped);assert.equal(translated.name,"UserCancelled");
    assert.equal(isUserCancelled(translated),true);assert.equal(commandOf(translated),"native command");
});

test("native cancellation traversal is bounded and does not invent stop state",()=>{
    const circular=new Error("ordinary");circular.cause=circular;
    assert.equal(hostError(circular),circular);assert.equal(hostError(null),null);
    let current=Object.assign(new Error("stop"),{errorNumber:-128});
    for(let count=0;count<7;count+=1){current=new Error("context",{cause:current});}
    assert.equal(isUserCancelled(hostError(current)),true);
    const deeper=new Error("context",{cause:current});assert.equal(hostError(deeper),deeper);
});
