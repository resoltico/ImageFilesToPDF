"use strict";
const test=require("node:test");const assert=require("node:assert/strict");
const {SETTING_CHOICES}=require("../../../src/core/settings.js");
const {PAPER_SIZE,ORIENTATION,OUTPUT_MODE}=require("../../../src/host/settings-model.js");
test("every canonical legal choice is offered exactly once",()=>{
    for(const [field,control] of [["paperSize",PAPER_SIZE],["orientation",ORIENTATION],["mode",OUTPUT_MODE]]) {
        assert.deepEqual(control.choices.map(choice=>choice.value),SETTING_CHOICES[field]);
    }
});
