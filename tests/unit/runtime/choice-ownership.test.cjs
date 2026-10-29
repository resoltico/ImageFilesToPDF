"use strict";
const test=require("node:test");const assert=require("node:assert/strict");
const fs=require("node:fs");const vm=require("node:vm");
const {SETTING_CHOICES}=require("../../../src/core/settings.js");
const {PAPER_SIZE,ORIENTATION,OUTPUT_MODE}=require("../../../src/runtime/choices.js");
test("every canonical legal choice is offered exactly once",()=>{
    for(const [field,control] of [["paperSize",PAPER_SIZE],["orientation",ORIENTATION],["mode",OUTPUT_MODE]]) {
        assert.deepEqual(control.choices.map(choice=>choice.value),SETTING_CHOICES[field]);
    }
});
test("presentation derives legal ids from the core rather than a second list",()=>{
    const module={exports:{}};const settings=require("../../../src/core/settings.js");
    const definitions={...settings,SETTING_CHOICES:{...SETTING_CHOICES,paperSize:[...SETTING_CHOICES.paperSize,"TestPaper"]}};
    vm.runInNewContext(fs.readFileSync(require.resolve("../../../src/runtime/choices.js"),"utf8"),{module,globalThis,require:name=>name.includes("settings")?definitions:require("../../../src/core/limits.js")});
    assert.deepEqual(Array.from(module.exports.PAPER_SIZE.choices,choice=>choice.value),["A4","Letter","TestPaper"]);
    assert.equal(module.exports.PAPER_SIZE.choices[2].label,"TestPaper");
});
