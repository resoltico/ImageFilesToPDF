"use strict";
const assert=require("node:assert/strict");
const test=require("node:test");
const {Buffer}=require("node:buffer");
const {commandLengthOf,COMMAND_BUDGET_BYTES}=require("../../../src/backend/batching.js");
const {shellJoin}=require("../../../src/backend/shell.js");

test("argv budget measures quoted UTF-8 bytes independently of JS code units",()=>{
    for(const argv of [[],["pdfcpu","import"],["/file'one.jpg","/été/海.png"],["emoji😀.png"]]){
        const expected=argv.length?Buffer.byteLength(shellJoin(argv),"utf8")+1:0;
        assert.equal(commandLengthOf(argv),expected);
    }
    assert.equal(COMMAND_BUDGET_BYTES,131072);
});
