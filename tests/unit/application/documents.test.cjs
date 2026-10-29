"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { executeDocuments } = require("../../../src/application/documents.js");
const { OperationError, UserCancelled } = require("../../../src/core/errors.js");
const { documentPlan } = require("../../../src/core/document-plan.js");
const { runOutcome } = require("../../../src/core/outcomes.js");

const {fixture}=require("./document-fixture.cjs");

test("plan groups ordered sources and chooses per-source destinations", () => {
    const combined = fixture(2);
    assert.equal(combined.plans.length, 1);
    assert.deepEqual(combined.plans[0].sources.map((source) => source.path), ["/source/0.png", "/source/1.png"]);
    const separate = fixture(2, { mode: "separate" });
    assert.deepEqual(separate.plans.map((plan) => plan.destination), ["/out/0_20261029_123456.pdf", "/out/1_20261029_123456.pdf"]);
    assert.deepEqual(documentPlan({ mode: "single" }, [], "stamp"), []);
});

for (const [count, size, argv, expected] of [
    [1, 1, 100, [1]], [32, 1, 100, [32]], [33, 1, 100, [32, 1]],
    [3, 32 * 1024 * 1024, 100, [2, 1]], [2, 65 * 1024 * 1024, 100, [1, 1]],
    [5, 1, 2, [2, 2, 1]]
]) {
    test(`bounded import: ${count} pages of ${size} bytes, argv ${argv}`, () => {
        const sample = fixture(count, { size, argv });
        const result = executeDocuments(sample.ports, sample.plans);
        assert.equal(result[0].state, "saved");
        assert.equal(result[0].output, "/out/output_20261029_123456.pdf.actual");
        assert.equal(result[0].pages, count);
        assert.deepEqual(sample.events.filter(([kind]) => kind === "import").map(([, pages]) => pages.length), expected);
        assert.equal(sample.owned.size, 0);
        const kinds = sample.events.map(([kind]) => kind);
        assert.ok(kinds.indexOf("validate") < kinds.indexOf("publish"));
    });
}

test("a combined source failure cannot publish a surviving subset", () => {
    const sample = fixture(3, { fail: 1 });
    const [result] = executeDocuments(sample.ports, sample.plans);
    assert.equal(result.state, "failed");
    assert.equal(result.pages, 1);
    assert.ok(!sample.events.some(([kind]) => kind === "publish"));
    assert.equal(sample.owned.size, 0);
});

test("separate source failures continue other documents", () => {
    const sample = fixture(3, { mode: "separate" });
    const {prepare} = sample.ports;
    sample.ports.prepare = (source, index) => { if (source.path === "/source/1.png") { throw new OperationError("damage"); } return prepare(source, index); };
    assert.deepEqual(executeDocuments(sample.ports, sample.plans).map((record) => record.state), ["saved", "failed", "saved"]);
});

for (const operation of ["beginning", "prepare", "import", "validate"]) {
    test(`${operation} stop removes only disposable work`, () => {
        const sample = fixture(2, { mode: "separate", ports: { [operation]: () => { throw new UserCancelled(); } } });
        const records = executeDocuments(sample.ports, sample.plans);
        assert.deepEqual(records.map((record) => record.state), ["cancelled", "not-started"]);
        assert.equal(runOutcome(records).state, "cancelled");
        assert.equal(sample.owned.size, 0);
    });
}

for (const operation of ["import", "validate"]) {
    test(`${operation} failure never publishes`, () => {
        const sample = fixture(1, { ports: { [operation]: () => { throw new OperationError("backend"); } } });
        assert.equal(executeDocuments(sample.ports, sample.plans)[0].state, "failed");
        assert.equal(sample.owned.size, 0);
    });
}

test("validated PDFs survive publication faults and carry structured recovery", () => {
    const error = new Error("save failed"); error.recovery = "/recovery/kept.pdf";
    const sample = fixture(2, { ports: { publish: () => { throw error; } } });
    const [result] = executeDocuments(sample.ports, sample.plans);
    assert.equal(result.state, "recovered");
    assert.equal(result.recovery, "/recovery/kept.pdf");
    assert.ok(!sample.events.some(([kind, path]) => kind === "remove" && path.endsWith(".pdf")));
});

test("unknown faults retain validated workspace and stop subsequent documents", () => {
    const sample = fixture(2, { mode: "separate", ports: { publish: () => { throw new TypeError("bug"); } } });
    const records = executeDocuments(sample.ports, sample.plans);
    assert.equal(records[0].state, "recovered");
    assert.equal(records[0].recovery, "/work/0.pdf");
    assert.equal(records[0].issues[0].code, "fault");
    assert.equal(records[1].state, "not-started");
});

test("a saved result survives a faulted observer", () => {
    const sample = fixture(1, { ports: { completed: () => { throw new Error("observer"); } } });
    const [result] = executeDocuments(sample.ports, sample.plans);
    assert.equal(result.state, "saved");
    assert.equal(runOutcome([result]).state, "complete");
    assert.ok(result.diagnostics.length > 0);
});

test("empty plan has no imports and produces an incomplete run", () => {
    const sample = fixture(0);
    assert.deepEqual(executeDocuments(sample.ports, sample.plans), []);
    assert.equal(runOutcome([]).state, "incomplete");
});

test("a failed flush also releases the just-prepared page outside the queued batch", () => {
    const sample=fixture(33,{ports:{import:()=>{throw new OperationError("disk full");}}});
    const [record]=executeDocuments(sample.ports,sample.plans);
    assert.equal(record.state,"failed");
    assert.equal(record.issues[0].stage,"import");
    assert.equal(sample.owned.size,0);
});

test("source mappings, ordered page arguments and semantic failure stages are retained",()=>{
    const sample=fixture(3);const records=executeDocuments(sample.ports,sample.plans);
    assert.deepEqual(records,[{state:"saved",sources:["/source/0.png","/source/1.png","/source/2.png"],pages:3,issues:[],output:"/out/output_20261029_123456.pdf.actual"}]);
    assert.deepEqual(sample.events.find(([kind])=>kind==="import")[1],["/work/0.jpg","/work/1.jpg","/work/2.jpg"]);
    for(const stage of ["validate","publish"]) {
        const failed=fixture(1,{ports:{[stage]:()=>{throw new OperationError("refused");}}});
        const [record]=executeDocuments(failed.ports,failed.plans);
        assert.equal(record.issues[0].stage,stage==="validate"?"validation":"publication");
    }
});

test("fault mixtures and recovered cancellation stop subsequent work without losing source mappings",()=>{
    for(const code of ["fault","cancelled"]) {
        const error=new Error("failure");error.issues=[{code:"operation"},{code}];
        const sample=fixture(2,{mode:"separate",ports:{publish:()=>{throw error;}}});
        const records=executeDocuments(sample.ports,sample.plans);
        assert.equal(records[0].state,"recovered");
        assert.equal(Boolean(records[0].fatal),code==="fault");
        assert.deepEqual(records[1],{state:"not-started",sources:["/source/1.png"],pages:0,issues:[]});
    }
});

test("an empty defensive document cannot issue an empty import",()=>{
    const {executeDocument}=require("../../../src/application/documents.js");
    const sample=fixture(0,{ports:{validate:()=>{throw new OperationError("empty document");}}});
    const result=executeDocument(sample.ports,{sources:[],destination:"/out.pdf"},0);
    assert.equal(result.state,"failed");
    assert.ok(!sample.events.some(([kind])=>kind==="import"));
});

test("a combined source failure names the responsible original input",()=>{
    const sample=fixture(3,{fail:1});const [result]=executeDocuments(sample.ports,sample.plans);
    assert.deepEqual(result.sources,["/source/0.png","/source/1.png","/source/2.png"]);
    assert.equal(result.issues[0].source,"/source/1.png");
    assert.equal(result.issues[0].stage,"preparation");
});

test("malformed issue arrays cannot discard earlier confirmed outputs",()=>{
    const sample=fixture(3,{mode:"separate"});const {publish} = sample.ports;
    sample.ports.publish=(staged,path)=>{if(path.includes("/1_")){const error=new Error("bug");error.issues=[null];throw error;}return publish(staged,path);};
    const result=executeDocuments(sample.ports,sample.plans);
    assert.deepEqual(result.map((record)=>record.state),["saved","recovered","not-started"]);
    assert.equal(result[1].issues[0].code,"fault");assert.equal(result[0].output,"/out/0_20261029_123456.pdf.actual");
});

