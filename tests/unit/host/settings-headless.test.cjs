"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {executeRun}=require("../../../src/application/run.js");
const {collectInvocation}=require("../../../src/host/input.js");
const {createFakeApp}=require("../ports/fake-app.cjs");

test("headless control consumes the validated request without asking settings or touching memory",()=>{
    const config={paperSize:"A4",orientation:"Portrait",mode:"combined",resolutionLimit:72,quality:92,background:"#FFFFFF"};
    const invocation=collectInvocation(createFakeApp([["/bin/cat",JSON.stringify(config)]]),["--headless","/config","/source.png"],true);
    const asked=[];const settings=[];
    executeRun({progress:{pause:()=>undefined,close:()=>undefined,diagnostics:[]},prepare:()=>({invocation,selection:{images:[{path:"/source.png"}],rejected:[]}}),
        review:()=>asked.push("review"),settings:()=>asked.push("settings"),createJob:(request,value)=>{settings.push(value);return {};},
        convert:()=>({documents:[{state:"saved",sources:["/source.png"],pages:1,output:"/out.pdf",issues:[]}],issues:[]}),present:(value)=>value});
    assert.deepEqual(asked,[]);assert.equal(settings[0],invocation.settings);assert.deepEqual(settings[0],config);
});
