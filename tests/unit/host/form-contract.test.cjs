"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {formSpec}=require("../../../src/host/settings-model.js");

test("form defaults explain the action and preset meanings from the same offered records",()=>{
    const spec=formSpec();assert.equal(spec.detail,"Choose the page settings, then Create.");
    assert.ok(!spec.fullDetail.includes("presets"));
    assert.deepEqual(spec.buttons,["Create","Cancel"]);assert.ok(spec.rows.every((row)=>!row.invalid));
});
