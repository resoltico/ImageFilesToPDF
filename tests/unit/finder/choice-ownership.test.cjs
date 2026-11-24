"use strict";
const test=require("node:test");const assert=require("node:assert/strict");
const {SETTINGS_SCHEMA}=require("../../../src/core/settings.js");
const { CONTROLS,PAPER_SIZE}=require("../../../src/finder/quick-action/settings-model.js");
const { orientation: ORIENTATION, mode: OUTPUT_MODE } = CONTROLS;
test("every canonical legal choice is offered exactly once",()=>{
    for(const [field,control] of [["paperSize",PAPER_SIZE],["orientation",ORIENTATION],["mode",OUTPUT_MODE]]) {
        assert.deepEqual(control.choices.map(choice=>choice.value),SETTINGS_SCHEMA[field].choices.map(choice=>choice.value));
    }
});
