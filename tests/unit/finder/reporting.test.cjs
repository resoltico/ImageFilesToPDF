"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createFakeApp } = require("../ports/fake-app.cjs");

test("interactive completion returns undefined and creates no text results", () => {
    const { reportResult } = require("../../../src/finder/quick-action/reporting.js");
    const app=createFakeApp();
    assert.equal(reportResult(app,{state:"complete",documents:[],rejected:[],issues:[],diagnostics:[],elapsed:"0 seconds"}),undefined);
});

test("empty selections explain how to select sources in both interfaces",()=>{
    const { reportNoImages } = require("../../../src/finder/quick-action/reporting.js");
const { describeNoImages } = require("../../../src/core/run-report.js");
    assert.match(describeNoImages([]),/No images selected/u);
    const app=createFakeApp();
    assert.equal(reportNoImages(app,[]),undefined);
    assert.match(app.dialogs[0].message,/Finder/u);
    assert.equal(app.dialogs[0].message.split("No images selected.").length,2);
    const refused=[{path:"/notes.txt",reason:"unsupported"}];
    reportNoImages(app,refused);
    assert.equal(app.dialogs[1].message.split("Nothing to convert.").length,2);
    assert.match(app.dialogs[1].message,/notes\.txt: unsupported/u);
});

test("the no-images report is dismissed with OK", () => {
    const { reportNoImages } = require("../../../src/finder/quick-action/reporting.js");
    const buttons = [];
    reportNoImages({ displayDialog(text, options) { buttons.push(options.buttons); return { buttonReturned: "OK" }; } }, []);
    assert.deepEqual(buttons.at(-1), ["OK"]);
});
