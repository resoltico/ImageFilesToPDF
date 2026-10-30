"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { DEFAULT_SETTINGS, validateSettings, normalizeSettings } = require("../../../src/core/settings.js");
const { configurationValues } = require("../../../src/host/cli.js");
const { PAPER_SIZE, defaultValueOf, defaultLabelOf } = require("../../../src/host/settings-model.js");

for (const field of ["resolutionLimit","quality","paperSize","orientation","mode","background"]) {
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
        assert.equal(validateSettings({...DEFAULT_SETTINGS,resolutionLimit:value}).issues[0].code,"integer");
    }
    assert.equal(validateSettings({...DEFAULT_SETTINGS,resolutionLimit:3e2}).settings.resolutionLimit,300);
    assert.equal(validateSettings({...DEFAULT_SETTINGS,quailty:92}).issues[0].code,"unknown");
    assert.equal(validateSettings({}).issues.length,6);
    for(const value of [null,[],false,0,"settings"]) { assert.equal(validateSettings(value).issues[0].code,"object"); }
});

test("supplied timestamp is optional only by absence",()=>{
    for(const timestamp of [null,false,0,"",[],{},"2026/10/29"]) {
        assert.throws(()=>configurationValues({...DEFAULT_SETTINGS,timestamp}),(error)=>error.issues.some((issue)=>issue.field==="timestamp"));
    }
    assert.equal(configurationValues({...DEFAULT_SETTINGS,timestamp:"20240229_010203"}).timestamp,"20240229_010203");
});

test("defaults are domain values independent of popup order",()=>{
    const reordered={...PAPER_SIZE,choices:[...PAPER_SIZE.choices].reverse()};
    assert.equal(defaultValueOf(reordered),"A4");
    assert.equal(defaultLabelOf(reordered),"A4");
    assert.deepEqual(normalizeSettings(DEFAULT_SETTINGS),DEFAULT_SETTINGS);
});

test("settings issue records keep stable fields, codes, stages and bounded explanations",()=>{
    assert.deepEqual(validateSettings(null),{issues:[{code:"object",stage:"settings",message:"Settings must be an object."}]});
    const bad={...DEFAULT_SETTINGS,paperSize:"Legal",resolutionLimit:true,background:"purple",typo:1};
    assert.deepEqual(validateSettings(bad).issues,[
        {field:"typo",code:"unknown",stage:"settings",message:"Unknown setting: typo."},
        {field:"paperSize",code:"choice",stage:"settings",message:"Paper size must be one of: A4, Letter."},
        {field:"resolutionLimit",code:"integer",stage:"settings",message:"Maximum resolution must be a whole number from 72 to 1017."},
        {field:"background",code:"colour",stage:"settings",message:"Page background must be six hexadecimal digits, for example #C7DAE8. The # is optional, and transparency is not supported."}
    ]);
    assert.throws(()=>normalizeSettings(bad),(error)=>error.message===validateSettings(bad).issues.map((issue)=>issue.message).join("\n"));
});
