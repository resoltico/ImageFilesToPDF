"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { DEFAULT_SETTINGS, validateSettings, normalizeSettings } = require("../../../src/core/settings.js");
const { collectInvocation } = require("../../../src/runtime/input.js");
const { createFakeApp } = require("../runtime/fake-app.cjs");
const { PAPER_SIZE, defaultValueOf, defaultLabelOf } = require("../../../src/runtime/choices.js");

for (const field of ["dpi","quality","paperSize","orientation","mode","background"]) {
    for (const value of [null,true,false,[],{},[300]]) {
        test(`strict ${field} refuses ${JSON.stringify(value)}`,()=>{
            const result=validateSettings({...DEFAULT_SETTINGS,[field]:value});
            assert.equal(result.issues.length,1);
            assert.equal(result.issues[0].field,field);
        });
    }
}

test("quoted and hexadecimal numeric strings and unknown fields are errors",()=>{
    for (const value of ["300","3e2","0x12c"]) {
        assert.equal(validateSettings({...DEFAULT_SETTINGS,dpi:value}).issues[0].code,"integer");
    }
    assert.equal(validateSettings({...DEFAULT_SETTINGS,dpi:3e2}).settings.dpi,300);
    assert.equal(validateSettings({...DEFAULT_SETTINGS,quailty:92}).issues[0].code,"unknown");
    assert.equal(validateSettings({}).issues.length,6);
    for(const value of [null,[],false,0,"settings"]) { assert.equal(validateSettings(value).issues[0].code,"object"); }
});

test("supplied timestamp is optional only by absence",()=>{
    for(const timestamp of [null,false,0,"",[],{},"2026/10/29"]) {
        const app=createFakeApp([["/bin/cat",JSON.stringify({...DEFAULT_SETTINGS,timestamp})]]);
        assert.throws(()=>collectInvocation(app,["--headless","/config","/image"],true),(error)=>error.issues.some((issue)=>issue.field==="timestamp"));
    }
    const app=createFakeApp([["/bin/cat",JSON.stringify({...DEFAULT_SETTINGS,timestamp:"99999999_999999"})]]);
    assert.equal(collectInvocation(app,["--headless","/config","/image"],true).timestamp,"99999999_999999");
});

test("defaults are domain values independent of popup order",()=>{
    const reordered={...PAPER_SIZE,choices:[...PAPER_SIZE.choices].reverse()};
    assert.equal(defaultValueOf(reordered),"A4");
    assert.equal(defaultLabelOf(reordered),"A4");
    assert.deepEqual(normalizeSettings(DEFAULT_SETTINGS),DEFAULT_SETTINGS);
});

test("settings issue records keep stable fields, codes, stages and bounded explanations",()=>{
    assert.deepEqual(validateSettings(null),{issues:[{code:"object",stage:"settings",message:"Settings must be an object."}]});
    const bad={...DEFAULT_SETTINGS,paperSize:"Legal",dpi:true,background:"purple",typo:1};
    assert.deepEqual(validateSettings(bad).issues,[
        {field:"typo",code:"unknown",stage:"settings",message:"Unknown setting: typo."},
        {field:"paperSize",code:"choice",stage:"settings",message:"Paper size must be one of: A4, Letter."},
        {field:"dpi",code:"integer",stage:"settings",message:"DPI must be a whole number from 72 to 1017."},
        {field:"background",code:"colour",stage:"settings",message:"Page background must be six hexadecimal digits, for example #C7DAE8."}
    ]);
    assert.throws(()=>normalizeSettings(bad),(error)=>error.message===validateSettings(bad).issues.map((issue)=>issue.message).join("\n"));
});
