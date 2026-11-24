"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");

test("artifact parser enforces classic-script syntax and preserves explicit comment positions",async()=>{
    const {parseScript,commentsIn}=await import("../../../tools/javascript.mjs");
    const tree=parseScript("function run(input) { return input; }",2022);
    assert.equal(tree.type,"Program");assert.equal(tree.body[0].id.name,"run");
    assert.throws(()=>parseScript('import fs from "fs";',2022));
    assert.deepEqual(commentsIn("/* license */\n// note\nconst value = 1;",2022),[
        {text:" license ",start:0,end:13},{text:" note",start:14,end:21}
    ]);
});

test("bundler configuration preserves the adopted standalone runtime and readable names",async()=>{
    const {BUNDLE_OPTIONS}=await import("../../../tools/scoped-bundle.mjs");
    assert.deepEqual(BUNDLE_OPTIONS,{bundle:true,platform:"neutral",format:"iife",globalName:"ImageFilesToPDF",target:"safari15.4",minifyWhitespace:true,minifyIdentifiers:false,legalComments:"none",write:false,metafile:true});
});
