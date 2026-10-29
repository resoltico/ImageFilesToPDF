"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { nativePublication, classify } = require("../../../src/runtime/native-publication.js");

for (const [code, state] of [[17,"exists"],[18,"cross-device"],[45,"unsupported"],[78,"unsupported"],[1,"denied"],[13,"denied"],[30,"denied"],[999,"unknown"]]) {
    test(`POSIX ${code} maps to ${state}`, () => assert.equal(classify(code,"NSPOSIXErrorDomain"),state));
}
for (const [code,state] of [[516,"exists"],[513,"denied"],[642,"denied"],[512,"unknown"]]) {
    test(`Cocoa ${code} maps to ${state}`, () => assert.equal(classify(code,"NSCocoaErrorDomain"),state));
}

test("unknown native domains are not guessed from English messages", () => assert.equal(classify(516,"Other"),"unknown"));
test("missing native bridge has no weak fallback", () => {
    assert.equal(nativePublication(null,{}),null);
    assert.equal(nativePublication({},null),null);
});

function abiFixture() {
    const events = [];
    const ns = (value) => value ?? { code:516,domain:"NSCocoaErrorDomain",localizedDescription:"occupied",
        userInfo:{objectForKey:()=>({isNil:()=>true})} };
    ns.NSFileManager = {defaultManager:{linkItemAtPathToPathError:(from,to,error)=>{events.push([from,to,error.code]);return false;}}};
    Object.assign(ns, {
        "renamex_np": () => { events.push("rename"); return -1; },
        strerror: (code) => `native ${code}`,
        __error: () => { events.push("errno"); return [17]; }
    });
    const port = nativePublication({ import:()=>true, bindFunction:()=>true,unwrap:(value)=>value }, ns);
    return { port, events, ns };
}

test("exact link uses NSError and rename reads errno immediately", () => {
    const { port, events, ns } = abiFixture();
    assert.equal(port.link("/a","/b").state,"exists");
    assert.deepEqual(events[0],["/a","/b",516]);
    assert.equal(port.rename("/a","/b").state,"exists");
    assert.deepEqual(events.slice(1),["rename","errno"]);
    Object.assign(ns, { "renamex_np": () => 0 });
    assert.deepEqual(port.rename("/a","/b"),{state:"created"});
    ns.NSFileManager.defaultManager.linkItemAtPathToPathError = () => true;
    assert.deepEqual(port.link("/a","/b"),{state:"created"});
});

test("Cocoa link errors classify an underlying POSIX cause without guessing",()=>{
    for(const underlying of [null,{isNil:()=>true},{isNil:()=>false,code:18,domain:"NSPOSIXErrorDomain"}]) {
        const error={code:512,domain:"NSCocoaErrorDomain",localizedDescription:"localized text",userInfo:{objectForKey:()=>underlying}};
        const ns=(value)=>value??error;
        ns.NSFileManager={defaultManager:{linkItemAtPathToPathError:()=>false}};
        const port=nativePublication({import:()=>true,bindFunction:()=>true,unwrap:(value)=>value},ns);
        assert.equal(port.link("/a","/b").state,underlying?.code===18?"cross-device":"unknown");
    }
});

test("native imports and ABI bindings match the classified operations",()=>{
    const events=[];
    const ns={NSFileManager:{defaultManager:{}}};
    nativePublication({import:(name)=>events.push(name),bindFunction:(...args)=>events.push(args)},ns);
    assert.deepEqual(events,["Foundation","stdio",["__error",["int *",[]]],["strerror",["char *",["int"]]]]);
});

test("native diagnostics retain domain, numeric code and operation text",()=>{
    const {port}=abiFixture();
    assert.deepEqual(port.link("/a","/b").diagnostic,{code:516,domain:"NSCocoaErrorDomain",message:"occupied"});
    assert.deepEqual(port.rename("/a","/b").diagnostic,{code:17,domain:"NSPOSIXErrorDomain",message:"native 17"});
});

test("a known primary native error keeps its meaning ahead of unrelated underlying details",()=>{
    const error={code:516,domain:"NSCocoaErrorDomain",localizedDescription:"occupied",userInfo:{objectForKey:()=>({isNil:()=>false,code:13,domain:"NSPOSIXErrorDomain"})}};
    const ns=(value)=>value??error;ns.NSFileManager={defaultManager:{linkItemAtPathToPathError:()=>false}};
    const port=nativePublication({import:()=>true,bindFunction:()=>true,unwrap:(value)=>value},ns);
    assert.equal(port.link("/a","/b").state,"exists");
});
