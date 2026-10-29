"use strict";
const test=require("node:test");const assert=require("node:assert/strict");
const {registerArtifact,retainsArtifact,hasRetainedArtifacts,requireValidatedArtifact,releaseArtifact}=require("../../../src/core/artifacts.js");

test("ownership is registered before creation and duplicate paths cannot replace an owner",()=>{
    const owned=new Map();const artifact=registerArtifact(owned,"/pdf");
    assert.equal(owned.get("/pdf"),artifact);assert.deepEqual(artifact,{path:"/pdf",state:"building"});
    assert.throws(()=>registerArtifact(owned,"/pdf"),/already owned/u);
    assert.equal(owned.get("/pdf"),artifact);
});

test("only disposable and confirmed released states permit workspace deletion",()=>{
    const owned=new Map();assert.equal(hasRetainedArtifacts(owned),false);assert.equal(retainsArtifact(null),true);
    const artifact=registerArtifact(owned,"/pdf");
    for(const state of ["building","validating","validated","released","unknown",undefined]){
        artifact.state=state;assert.equal(hasRetainedArtifacts(owned),!["building","released"].includes(state));
    }
});

test("publication requires the registered validated record, release changes that same record",()=>{
    const owned=new Map();assert.throws(()=>requireValidatedArtifact(owned,"/pdf"),/owned validated/u);
    const artifact=registerArtifact(owned,"/pdf");assert.throws(()=>releaseArtifact(owned,"/pdf"),/owned validated/u);
    artifact.state="validated";assert.equal(requireValidatedArtifact(owned,"/pdf"),artifact);
    releaseArtifact(owned,"/pdf");assert.equal(owned.get("/pdf").state,"released");
});
