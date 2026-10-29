"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {executeRun}=require("../../../src/application/run.js");

test("controller closes progress and presents the same authoritative document outcomes",()=>{
    const events=[];
    const selection={images:[{path:"a"}],rejected:[{path:"bad"}]};
    const documents=[{state:"saved",sources:["a"],pages:1,output:"out.pdf",issues:[]}];
    const progress={diagnostics:[{code:"observer"}],pause:()=>events.push("pause"),close:()=>events.push("close")};
    const ports={progress,prepare:()=>({selection,invocation:{headless:true,settings:{mode:"single"}}}),createJob:()=>({kind:"job"}),convert:()=>({documents,issues:[]}),
        present(result){events.push(result);return "presented";}};
    assert.equal(executeRun(ports),"presented");
    assert.deepEqual(events,["pause","close",{state:"incomplete",documents,rejected:selection.rejected,issues:[],diagnostics:progress.diagnostics}]);
});

test("empty selection never asks settings or starts conversion",()=>{
    const events=[];
    const refused=[{path:"bad"}];
    const result=executeRun({prepare:()=>({selection:{images:[],rejected:refused}}),noImages:(items)=>{events.push(items);return "empty";}});
    assert.equal(result,"empty");
    assert.deepEqual(events,[refused]);
});

test("presentation faults carry the same confirmed outcome rather than discarding saved outputs",()=>{
    const outcome={documents:[{state:"saved",sources:["a"],pages:1,output:"/saved.pdf",issues:[]}],issues:[]};
    const ports={progress:{pause:()=>undefined,close:()=>undefined,diagnostics:[]},prepare:()=>({invocation:{headless:true,settings:{}},selection:{images:[{path:"a"}],rejected:[]}}),
        createJob:()=>({}),convert:()=>outcome,present:()=>{throw new TypeError("view failed");}};
    assert.throws(()=>executeRun(ports),(error)=>error.outcome===outcome&&error.outcome.documents[0].output==="/saved.pdf");
});

test("interactive consent precedes settings and cancellation creates no job",()=>{
    const {UserCancelled}=require("../../../src/core/errors.js");const events=[];
    const request={invocation:{headless:false},selection:{images:[{path:"a",folder:"/a/"}],rejected:[{name:"bad",reason:"refused"}]}};
    const ports={progress:{pause:()=>events.push("pause"),diagnostics:[]},prepare:()=>request,
        review:(context)=>{assert.equal(context.count,1);events.push("review");throw new UserCancelled();},settings:()=>events.push("settings"),createJob:()=>events.push("job")};
    assert.throws(()=>executeRun(ports),/User cancelled/u);assert.deepEqual(events,["pause","review"]);
});

test("interactive settings and consent share the core selection facts",()=>{
    const events=[];const settings={mode:"single"};
    const request={invocation:{headless:false},selection:{images:[{path:"a",folder:"/a/"}],rejected:[{name:"bad",reason:"refused"}]}};
    executeRun({progress:{pause:()=>undefined,close:()=>undefined,diagnostics:[]},prepare:()=>request,
        review:(context)=>events.push(["review",context.count,context.folders]),settings:(context)=>{events.push(["settings",context.count]);return settings;},
        createJob:(prepared,value)=>{assert.equal(value,settings);events.push(["job"]);return {};},
        convert:()=>({documents:[],issues:[]}),present:(value)=>value});
    assert.deepEqual(events,[["review",1,["/a/"]],["settings",1],["job"]]);
});

test("even a primitive presentation fault retains the completed outcome",()=>{
    const outcome={documents:[{state:"saved",sources:["a"],pages:1,output:"/saved.pdf",issues:[]}],issues:[]};
    const ports={progress:{pause:()=>undefined,close:()=>undefined,diagnostics:[]},prepare:()=>({invocation:{headless:true,settings:{}},selection:{images:[{path:"a"}],rejected:[]}}),
        createJob:()=>({}),convert:()=>outcome,present:()=>{
            // Deliberately malformed exception at the presentation boundary.
            // eslint-disable-next-line no-throw-literal
            throw null;
        }};
    assert.throws(()=>executeRun(ports),(error)=>error.outcome===outcome&&error.message==="Unknown error");
});

test("interactive requests without refusals do not ask an unnecessary selection consent",()=>{
    const events=[];
    executeRun({progress:{pause:()=>undefined,close:()=>undefined,diagnostics:[]},prepare:()=>({invocation:{headless:false},selection:{images:[{path:"a",folder:"/a/"}],rejected:[]}}),
        review:()=>events.push("review"),settings:()=>({mode:"single"}),createJob:()=>({}),convert:()=>({documents:[],issues:[]}),present:(value)=>value});
    assert.deepEqual(events,[]);
});

test("a late native cancellation during reporting carries its cause and all saved outputs",()=>{
    const {UserCancelled,isUserCancelled}=require("../../../src/core/errors.js");
    const {failedRun}=require("../../../src/core/outcomes.js");
    const result={documents:[{state:"saved",sources:["a"],pages:1,output:"/saved.pdf",issues:[]}],issues:[]};
    const ports={progress:{pause:()=>undefined,close:()=>undefined,diagnostics:[]},prepare:()=>({invocation:{headless:true,settings:{}},selection:{images:[{path:"a"}],rejected:[]}}),createJob:()=>({}),convert:()=>result,present:()=>{throw new UserCancelled();}};
    assert.throws(()=>executeRun(ports),(error)=>isUserCancelled(error)&&failedRun(error,error.outcome)===result);
});

for(const thrown of [null,undefined,new TypeError("close fault")]) {
    test(`progress teardown throwing ${String(thrown)} cannot erase a completed outcome`,()=>{
        const {failedRun}=require("../../../src/core/outcomes.js");
        const result={documents:[{state:"saved",sources:["a"],pages:1,output:"/saved.pdf",issues:[]}],issues:[]};
        let presented=false;
        const ports={progress:{pause:()=>undefined,close(){throw thrown;},diagnostics:[]},prepare:()=>({invocation:{headless:true,settings:{}},selection:{images:[{path:"a"}],rejected:[]}}),createJob:()=>({}),convert:()=>result,present(){presented=true;}};
        assert.throws(()=>executeRun(ports),error=>{
            const failed=failedRun(error,error.outcome);
            assert.equal(failed.documents[0].output,"/saved.pdf");assert.equal(failed.issues[0].stage,"reporting");return true;
        });
        assert.equal(presented,false);
    });
}

test("an unreadable presentation exception cannot erase the confirmed outcome",()=>{
    const result={documents:[{state:"saved",sources:["a"],pages:1,output:"/saved.pdf",issues:[]}],issues:[]};
    const failure=Object.defineProperty({},"message",{get(){throw new TypeError("error getter");}});
    const ports={progress:{pause:()=>undefined,close:()=>undefined,diagnostics:[]},prepare:()=>({invocation:{headless:true,settings:{}},selection:{images:[{path:"a"}],rejected:[]}}),createJob:()=>({}),convert:()=>result,present(){throw failure;}};
    assert.throws(()=>executeRun(ports),error=>error.outcome===result&&error.message==="The failure details could not be read.");
});
