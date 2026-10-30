"use strict";
const assert=require("node:assert/strict");
const test=require("node:test");
const {nativeDestinationNames}=require("../../../src/host/destination-names.js");
const {createFakeHost}=require("../ports/fake-host.cjs");
const {installPlatform}=require("../ports/fake-platform.cjs");

function fixture() {
    const saved=Object.fromEntries(["ObjC","$","Ref","Application"].map(key=>[key,globalThis[key]]));
    const app=createFakeHost({files:["/input/photo.jpg","/input/photo.png","/work/owner.json"]});
    const platform=installPlatform(app);
    const records=[{path:"/input/photo.jpg",folder:"/input/",originalName:"photo.jpg"},
        {path:"/input/photo.png",folder:"/input/",originalName:"photo.png"}];
    platform.restore=()=>{for(const [key,value] of Object.entries(saved)) {if(value===undefined) {delete globalThis[key];} else {globalThis[key]=value;}}};
    return {app,platform,records,port:nativeDestinationNames(globalThis.ObjC,globalThis.$)};
}

test("native naming has no capability without the required bridge",()=>{
    assert.equal(nativeDestinationNames(null,null),null);
});

test("owned namespace prototypes are removed after classification",()=>{
    const {app,platform,records,port}=fixture();
    try {
        assert.deepEqual(port.groups(records,"/work"),[0,0]);
        assert.equal(app.nativeDirectories.size,0);
        assert.ok(app.files.has("/input/photo.jpg"));assert.ok(app.files.has("/input/photo.png"));
    } finally {platform.restore();}
});

test("cleanup faults retain the original programming failure and keep private paths diagnostic",()=>{
    const {platform,records,port}=fixture();
    Object.defineProperty(records[1],"originalName",{get(){throw new TypeError("name getter failed");}});
    globalThis.$.NSFileManager.defaultManager.removeItemAtPathError=()=>false;
    try {
        assert.throws(()=>port.groups(records,"/work"),(error)=>{
            assert.deepEqual(error.issues.map(issue=>issue.code),["fault","cleanup"]);
            assert.match(error.issues[0].message,/name getter failed/u);
            assert.equal(error.issues[1].diagnostic.path,"/work/output-names");
            assert.ok(error.issues.every(issue=>!issue.message.includes("/work")));
            return true;
        });
    } finally {platform.restore();}
});
