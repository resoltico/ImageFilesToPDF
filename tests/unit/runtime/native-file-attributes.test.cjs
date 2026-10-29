"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {nativePublication}=require("../../../src/runtime/native-publication.js");
const {identityOf,attributesAt}=require("../../../src/runtime/native-file-attributes.js");
const {nativeAttributes}=require("./fake-attributes.cjs");

function fixture(values) {
    const ns=(value)=>value??{};
    Object.assign(ns,{NSFileType:"kind",NSFileSystemNumber:"device",NSFileSystemFileNumber:"file",NSFileSize:"size",
        NSFileManager:{defaultManager:{attributesOfItemAtPathError:()=>nativeAttributes(values)}}});
    const objc={import:()=>true,bindFunction:()=>true,unwrap:(value)=>value?.boxed??value};
    return {port:nativePublication(objc,ns),objc,ns};
}

for(const values of [null,{kind:"NSFileTypeDirectory"},{kind:"NSFileTypeSymbolicLink"},
    {kind:"NSFileTypeRegular",device:"",file:"2",size:4},
    {kind:"NSFileTypeRegular",device:"1",file:"bad",size:4},
    {kind:"NSFileTypeRegular",device:"1",file:"2",size:-1},
    {kind:"NSFileTypeRegular",device:"1",file:"2",size:"9007199254740993"}]) {
    test(`unidentified native entry is never proof of publication: ${JSON.stringify(values)}`,()=>{
        assert.deepEqual(fixture(values).port.facts("/path"),{identity:"",size:-1});
    });
}

test("native file numbers retain exact 64-bit identity without JS numeric rounding",()=>{
    const {port}=fixture({kind:"NSFileTypeRegular",device:"16777232",file:"9007199254740993",size:"4096"});
    assert.deepEqual(port.facts("/path"),{identity:"16777232:9007199254740993",size:4096});
    assert.equal(identityOf({}, {}, null),"");
});

test("a wrapped native nil is not an entry and receives an NSError out object",()=>{
    const seen=[];const ns=(value)=>value??{errorOut:true};
    const attributes=attributesAt({attributesOfItemAtPathError:(...args)=>{seen.push(args);return {isNil:()=>true};}},ns,"/path");
    assert.equal(attributes,null);assert.deepEqual(seen,[["/path",{errorOut:true}]]);
});

test("native numeric facts never accept prefixes or fractional byte counts",()=>{
    for(const change of [{device:"1junk"},{file:"2junk"},{size:"1.5"}]){
        assert.deepEqual(fixture({kind:"NSFileTypeRegular",device:"1",file:"2",size:4,...change}).port.facts("/path"),{identity:"",size:-1});
    }
});

test("an empty regular file remains a known measurement rather than an unknown entry",()=>{
    assert.deepEqual(fixture({kind:"NSFileTypeRegular",device:"1",file:"2",size:0}).port.facts("/empty"),{identity:"1:2",size:0});
});
