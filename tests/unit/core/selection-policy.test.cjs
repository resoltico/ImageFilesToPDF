"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {SELECTION_REASONS,selectionReason,selectionRefusal}=require("../../../src/core/selection-policy.js");
const {sourceIssues}=require("../../../src/core/source-policy.js");

test("core owns file-selection policy and its receipt codes",()=>{
    assert.equal(selectionReason("package","a.png",true),"package");
    assert.equal(selectionReason("link","a.png",true),"link");
    assert.equal(selectionReason("other","a.png",true),"special-file");
    assert.equal(selectionReason("directory","a.png",true),"folder");
    assert.equal(selectionReason("file","a.png",true),"");
    assert.equal(selectionReason("file","a.png",false),"not-a-file");
    assert.equal(selectionReason("file","a.gif",true),"unsupported-format");
    assert.deepEqual(selectionRefusal("/x/bad.gif","unsupported-format"),{path:"/x/bad.gif",name:"bad.gif",
        reason:"This file is not a supported format; use JPEG, PNG, HEIC, TIFF, WebP or AVIF.",code:"unsupported-format",stage:"selection"});
    assert.deepEqual(selectionRefusal("","remote-url","https://a/b.png"),{path:"",name:"https://a/b.png",
        reason:"Remote URLs are not supported; download the file first.",code:"remote-url",stage:"selection"});
    assert.throws(()=>selectionRefusal("/a","selection-refused"),/Unknown selection refusal code: selection-refused/u);
});

test("every selection refusal code reads as a full sentence",()=>{
    assert.deepEqual(Object.keys(SELECTION_REASONS),["folder","unsupported-format","not-a-file","not-a-path","remote-url","not-a-folder",
        "package","link","special-file","unreadable","unexaminable","empty-folder"]);
    for(const [code,reason] of Object.entries(SELECTION_REASONS)) { assert.match(reason,/^[A-Z].*\.$/u,code); }
});

for(const format of ["JPEG","PNG","TIFF","HEIF","WebP"]) {
    test(`recognized raster family ${format} is accepted as one still`,()=>assert.deepEqual(sourceIssues({format,loader:"known",width:400,height:200,bands:3,orientation:1,pages:1}),[]));
}

test("source inspection issues retain their domain code, stage and explanation",()=>{
    assert.deepEqual(sourceIssues({format:"SVG",pages:1}),[{code:"not-an-image",stage:"inspection",message:"This file is not a supported still raster image."}]);
    assert.deepEqual(sourceIssues({format:"PNG",width:400,height:200,bands:3,orientation:1,pages:0}),[{code:"damaged",stage:"inspection",message:"This image is damaged or incomplete."}]);
    assert.deepEqual(sourceIssues({format:"PNG",width:400,height:200,bands:3,orientation:1,pages:2}),[{code:"multiple-images",stage:"inspection",message:"This file contains 2 images; only single images are supported."}]);
});

test("proven absent and inaccessible paths are classified before extensions", () => {
    assert.equal(selectionReason("missing", "/missing-anything", false), "not-a-path");
    assert.equal(selectionReason("missing", "/missing.jpg", false), "not-a-path");
    assert.equal(selectionReason("unreadable", "/blocked.txt", false), "unreadable");
    assert.equal(selectionReason("unexaminable", "/unknown", false), "unexaminable");
    assert.equal(selectionRefusal("/missing", "not-a-path").reason, "No file or folder exists at this path.");
});
