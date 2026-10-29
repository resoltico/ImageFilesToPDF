"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {executeDocuments}=require("../../../src/application/documents.js");
const {OperationError,UserCancelled}=require("../../../src/core/errors.js");
const {runOutcome}=require("../../../src/core/outcomes.js");
const {fixture}=require("./document-fixture.cjs");

for (const thrown of [null, undefined, new TypeError("publication fault")]) {
    test(`saved outputs survive second publication throwing ${String(thrown)}`, () => {
        const sample = fixture(3, {mode:"separate"}); const {publish} = sample.ports;
        sample.ports.publish = (path, destination) => { if (path === "/work/1.pdf") { throw thrown; } return publish(path, destination); };
        const records = executeDocuments(sample.ports, sample.plans);
        assert.deepEqual(records.map(record => record.state), ["saved", "recovered", "not-started"]);
        assert.equal(records[0].output, "/out/0_20261029_123456.pdf.actual");
        assert.equal(records[1].recovery, "/work/1.pdf");
        assert.deepEqual([records[1].issues[0].stage,records[1].issues.length],["publication",1]);
        assert.ok(!sample.events.some(([kind, path]) => kind === "remove" && path === "/work/1.pdf"));
    });
}

test("allocation faults after a commit preserve saved output and stop later work", () => {
    const sample = fixture(3, {mode:"separate"});
    const {allocate}=sample.ports;
    sample.ports.allocate = index => { if(index===1) {throw new TypeError("allocate");} return allocate(index); };
    const records = executeDocuments(sample.ports, sample.plans);
    assert.deepEqual(records.map(record=>record.state), ["saved","failed","not-started"]);
    assert.equal(records[0].output,"/out/0_20261029_123456.pdf.actual");
    assert.equal(records[1].issues[0].stage,"allocation");
    assert.deepEqual(sample.events.filter(([kind])=>kind==="remove").map(([,path])=>path),["/work/0.jpg"]);
});

for (const stage of ["recovery", "issues", "cause"]) {
    test(`failure introspection fault in ${stage} preserves validated ownership`,()=>{
        const error = new Error("save failed");Object.defineProperty(error,stage,{get(){throw new TypeError("getter bug");}});
        const sample=fixture(3,{mode:"separate"});const {publish} = sample.ports;
        sample.ports.publish=(path,destination)=>{if(path==="/work/1.pdf"){throw error;}return publish(path,destination);};
        const records=executeDocuments(sample.ports,sample.plans);
        assert.deepEqual(records.map(record=>record.state),["saved","recovered","not-started"]);
        assert.equal(records[1].recovery,"/work/1.pdf");assert.equal(records[1].fatal,true);
    });
}

test("all disposable pages receive cleanup attempts without masking the import failure",()=>{
    const sample=fixture(3);sample.ports.import=()=>{throw new OperationError("import disk full");};
    const removed=[];sample.ports.remove=path=>{removed.push(path);throw new TypeError("cleanup bug");};
    const [record]=executeDocuments(sample.ports,sample.plans);
    assert.deepEqual([record.pages,record.issues[0].message,record.issues[0].stage,record.fatal],[3,"import disk full","import",true]);
    assert.deepEqual(removed,["/work/0.jpg","/work/1.jpg","/work/2.jpg","/work/0.pdf"]);
    assert.equal(record.issues.filter(issue=>issue.stage==="cleanup").length,4);
});

test("a failing handoff retains the count of the newly prepared page and the original error",()=>{
    const sample=fixture(3);const {prepare} = sample.ports;const sizes=[40,20,10];
    sample.ports.prepare=(source,index)=>({...prepare(source,index),size:sizes[index]*1024*1024});
    sample.ports.import=()=>{throw new OperationError("disk full importing earlier batch");};
    const [record]=executeDocuments(sample.ports,sample.plans);
    assert.equal(record.pages,3);assert.equal(record.issues[0].stage,"import");
    assert.equal(record.issues[0].message,"disk full importing earlier batch");assert.equal(sample.owned.size,0);
});

for(const sizes of [[100,100],[40,20,10],[32,32,1]]) {
    test(`retained page bytes obey queue plus one new page exception for ${sizes}`,()=>{
        const sample=fixture(sizes.length);const held=new Map();let peak=0;const atPreparation=[];
        sample.ports.prepare=(source,index)=>{
            atPreparation.push([...held.values()].reduce((sum,size)=>sum+size,0));
            const page={path:`/page/${index}`,size:sizes[index]*1024*1024};held.set(page.path,page.size);
            peak=Math.max(peak,[...held.values()].reduce((sum,size)=>sum+size,0));return page;
        };
        sample.ports.remove=path=>held.delete(path);
        const records=executeDocuments(sample.ports,sample.plans);
        assert.deepEqual([records[0].state,held.size,atPreparation.every(bytes=>bytes<64*1024*1024),peak <= Math.max(100,64+Math.max(...sizes))*1024*1024],["saved",0,true,true]);
        if(sizes[0]===100){assert.deepEqual([atPreparation,peak],[[0,0],100*1024*1024]);}
    });
}

test("cleanup faults after an earlier commit retain saved and failed document records",()=>{
    const sample=fixture(3,{mode:"separate"});const imported=sample.ports.import;
    sample.ports.import=(path,pages)=>{if(path==="/work/1.pdf"){throw new OperationError("import failure");}imported(path,pages);};
    const {remove} = sample.ports;let current="";sample.ports.beginning=source=>{current=source.path;};
    sample.ports.remove=path=>{if(current==="/source/1.png"){throw new TypeError("cleanup fault");}remove(path);};
    const records=executeDocuments(sample.ports,sample.plans);
    assert.deepEqual([records.map(record=>record.state),records[0].output,records[1].issues.map(issue=>issue.stage)],[["saved","failed","not-started"],"/out/0_20261029_123456.pdf.actual",["import","cleanup","cleanup"]]);
});

test("uneven encoded sizes flush the previous batch before retaining an over-budget queue",()=>{
    const sample=fixture(3);const {prepare} = sample.ports;
    sample.ports.prepare=(source,index)=>({...prepare(source,index),size:[40,20,10][index]*1024*1024});
    assert.equal(executeDocuments(sample.ports,sample.plans)[0].state,"saved");
    assert.deepEqual(sample.events.filter(([kind])=>kind==="import").map(([,pages])=>pages),[["/work/0.jpg","/work/1.jpg"],["/work/2.jpg"]]);
});

for(const operation of ["import","validate","publish"]) {
    test(`${operation} issues are document-wide, without an invented last-source attribution`,()=>{
        const sample=fixture(2,{ports:{[operation]:()=>{throw new OperationError("failure");}}});
        const [record]=executeDocuments(sample.ports,sample.plans);
        assert.equal(Object.hasOwn(record.issues[0],"source"),false);
    });
}

test("a cancellation remains a stop even if its supplied issue has another code",()=>{
    const error=new UserCancelled();error.issues=[{code:"operation",stage:"preparation",message:"stop"}];
    const sample=fixture(2,{mode:"separate",ports:{prepare:()=>{throw error;}}});
    assert.deepEqual(executeDocuments(sample.ports,sample.plans).map(record=>record.state),["cancelled","not-started"]);
});

test("failure-normalization faults before validation preserve earlier commits and the failed current source",()=>{
    const sample=fixture(3,{mode:"separate"});const {prepare} = sample.ports;
    const error=Object.defineProperty({},"cause",{get(){throw new TypeError("cause getter bug");}});
    sample.ports.prepare=(source,index)=>{if(source.path==="/source/1.png"){throw error;}return prepare(source,index);};
    const records=executeDocuments(sample.ports,sample.plans);
    assert.deepEqual(records.map(record=>record.state),["saved","failed","not-started"]);
    assert.equal(records[1].issues.at(-1).stage,"failure-reporting");
    assert.equal(Object.hasOwn(records[1],"recovery"),false);
});

test("page-only disposal failure stops later documents even when staged cleanup succeeds",()=>{
    const sample=fixture(3,{mode:"separate"});const {remove} = sample.ports;
    sample.ports.import=()=>{throw new OperationError("import failed");};
    sample.ports.remove=path=>{if(path.endsWith(".jpg")){throw new Error("page unlink failed");}remove(path);};
    const records=executeDocuments(sample.ports,sample.plans);
    assert.deepEqual(records.map(record=>record.state),["failed","not-started","not-started"]);
    assert.equal(records[0].fatal,true);assert.equal(records[0].issues.at(-1).stage,"cleanup");
});

test("released artifacts are not disposed again after publication",()=>{
    const sample=fixture(1);const {remove}=sample.ports;
    sample.ports.remove=path=>{if(path.endsWith(".pdf")){throw new TypeError("unowned disposal");}remove(path);};
    const records=executeDocuments(sample.ports,sample.plans);
    assert.equal(runOutcome(records).state,"complete");
    assert.equal(sample.artifacts.get("/work/0.pdf").state,"released");
});

function failValidatedTransition(sample, target) {
    const {allocate}=sample.ports;
    sample.ports.allocate=index=>{
        const artifact=allocate(index);let {state} = artifact;
        Object.defineProperty(artifact,"state",{get:()=>state,set(next){if(index===target&&next==="validated"){throw new TypeError("validation transition fault");}state=next;}});
        return artifact;
    };
}

for(const mode of ["combined","separate"]) {
    test(`${mode} post-validation transition fault retains registered bytes and prior commits`,()=>{
        const sample=fixture(3,{mode});failValidatedTransition(sample,mode==="combined"?0:1);
        const records=executeDocuments(sample.ports,sample.plans);const current=records[mode==="combined"?0:1];
        assert.equal(current.state,"recovered");assert.equal(current.issues[0].message,"validation transition fault");
        assert.ok(sample.owned.has(current.recovery));assert.equal(sample.artifacts.get(current.recovery).state,"validating");
        if(mode==="separate"){assert.deepEqual(records.map(record=>record.state),["saved","recovered","not-started"]);}
    });
}

test("registration failure after an earlier commit prevents new bytes and validation",()=>{
    const sample=fixture(3,{mode:"separate"});const set=sample.artifacts.set.bind(sample.artifacts);
    sample.artifacts.set=(path,artifact)=>{if(path==="/work/1.pdf"){throw new TypeError("registration fault");}return set(path,artifact);};
    const records=executeDocuments(sample.ports,sample.plans);
    assert.deepEqual(records.map(record=>record.state),["saved","failed","not-started"]);
    assert.equal(records[1].issues[0].stage,"allocation");assert.equal(records[1].pages,0);
    assert.equal(sample.events.filter(([kind])=>kind==="validate").length,1);
});

test("an unexpected validation fault retains an explicitly unconfirmed candidate",()=>{
    const sample=fixture(1,{ports:{validate(){throw new TypeError("validator fault");}}});
    const [record]=executeDocuments(sample.ports,sample.plans);
    assert.equal(record.state,"failed");assert.equal(Object.hasOwn(record,"recovery"),false);
    assert.match(record.issues.at(-1).message,/Validation was not confirmed.*\n\/work\/0.pdf/u);
    assert.ok(sample.owned.has("/work/0.pdf"));assert.equal(sample.artifacts.get("/work/0.pdf").state,"validating");
});

test("a malformed post-commit issue result cannot reclassify a confirmed saved document",()=>{
    const sample=fixture(2,{mode:"separate"});const {publish}=sample.ports;
    sample.ports.publish=(path,destination)=>{
        const result=publish(path,destination);
        Object.defineProperty(result,"issues",{get(){throw new TypeError("issue getter fault");}});return result;
    };
    const records=executeDocuments(sample.ports,sample.plans);
    assert.deepEqual(records.map(record=>record.state),["saved","not-started"]);
    assert.equal(records[0].output,"/out/0_20261029_123456.pdf.actual");assert.equal(records[0].issues[0].message,"issue getter fault");
});
