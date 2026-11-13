"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const { commandLineInteraction } = require("../../../src/host/command-line/interaction.js");
const {executeRun}=require("../../../src/application/run.js");
const {configurationValues}=require("../../../src/host/command-line/cli.js");

test("headless control consumes the validated request without asking settings or touching memory",()=>{
    const config={paperSize:"A4",orientation:"Portrait",mode:"combined",resolutionLimit:72,quality:92,background:"#FFFFFF"};
    const invocation={...configurationValues(config),inputItems:["/source.png"]};
    const settings=[];
    executeRun({progress:{pause:()=>undefined,close:()=>undefined,diagnostics:[]},prepare:()=>({invocation,selection:{images:[{path:"/source.png"}],rejected:[]}}),
        interaction: commandLineInteraction(invocation),createJob:(request,value)=>{settings.push(value);return {};},
        convert:()=>({documents:[{state:"saved",sources:["/source.png"],pages:1,output:"/out.pdf",issues:[]}],issues:[]})});
    assert.equal(settings[0],invocation.settings);assert.deepEqual(settings[0],config);
});
