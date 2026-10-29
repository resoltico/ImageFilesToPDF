"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {selectionReason,selectionRefusal}=require("../../../src/core/selection-policy.js");
const {sourceIssues}=require("../../../src/core/source-policy.js");

test("core owns file-selection policy and stable refusal tags",()=>{
    assert.equal(selectionReason("package","a.png",true),"a package, not a folder of images");
    assert.equal(selectionReason("other","a.png",true),"a link; select the file it points to");
    assert.equal(selectionReason("directory","a.png",true),"a folder; select the images inside it");
    assert.equal(selectionReason("file","a.png",true),"");
    assert.equal(selectionReason("file","a.png",false),"not a readable file");
    assert.match(selectionReason("file","a.gif",true),/^not a supported format/u);
    assert.deepEqual(selectionRefusal({path:"bad",reason:"why"}),{path:"bad",reason:"why",code:"selection-refused",stage:"selection"});
});

for(const format of ["JPEG","PNG","TIFF","HEIF","WebP"]) {
    test(`recognized raster family ${format} is accepted as one still`,()=>assert.deepEqual(sourceIssues({format,pages:1}),[]));
}

test("source inspection issues retain their domain code, stage and explanation",()=>{
    assert.deepEqual(sourceIssues({format:"SVG",pages:1}),[{code:"source-format",stage:"inspection",message:"Only supported still raster images can be converted."}]);
    assert.deepEqual(sourceIssues({format:"PNG",pages:0}),[{code:"source-count",stage:"inspection",message:"The source image count is unknown."}]);
    assert.deepEqual(sourceIssues({format:"PNG",pages:2}),[{code:"source-multiple",stage:"inspection",message:"contains 2 pages. Only single-page images are supported; split the file and run the action on the pages."}]);
});
