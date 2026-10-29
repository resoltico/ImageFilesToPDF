"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const { inspectSource,readPageCount }=require("../../../src/runtime/source-image.js");
const { validatePdf }=require("../../../src/runtime/staging.js");
const { createFakeApp }=require("./fake-app.cjs");
const { createFakeHost }=require("./fake-host.cjs");
const { makeJob }=require("./fake-job.cjs");

test("missing frame metadata is interpreted only for a known format",()=>{
    const app=createFakeApp([["'n-pages'",new Error('field "n-pages" not found')]]);
    assert.equal(readPageCount(app,"vipsheader","/image").pages,undefined);
    assert.equal(readPageCount(app,"vipsheader","/image",true).pages,1);
    const broken=createFakeApp([["'n-pages'",new Error("corrupt")]]);
    assert.match(readPageCount(broken,"vipsheader","/image",true).unknown,/corrupt/u);
});

for(const loader of ["svgload","pdfload","rawload","unknownload"]) {
    test(`actual unsupported loader ${loader} is refused`,()=>{
        const host=createFakeHost();host.loader=loader;
        assert.throws(()=>inspectSource(makeJob(host),{path:"/owned"}),(error)=>error.issues[0].code==="source-format");
    });
}

test("unknown or incorrect final page counts never reach validation/publication",()=>{
    for(const count of ["not found","Page count: 2"]){
        const host=createFakeHost({files:["/stage.pdf"],failures:[["'info'",count]]});
        assert.throws(()=>validatePdf(makeJob(host),"/stage.pdf",1),/page count could not be verified|2 pages where 1/u);
        assert.ok(!host.commands.some((command)=>command.includes("'validate'")));
    }
});

test("absent loader metadata is never interpreted as a still raster",()=>{
    const host=createFakeHost({failures:[["'-a'","not metadata"]]});
    assert.throws(()=>inspectSource(makeJob(host),{path:"/owned"}),(error)=>error.issues[0].code==="source-format");
});

for(const [loader,format] of [["jpegload","JPEG"],["pngload","PNG"],["tiffload","TIFF"],["heifload","HEIF"],["webpload","WebP"],["pngload_buffer","PNG"]]) {
    test(`descriptor reconciles ${loader} into a validated ${format} record`,()=>{
        const host=createFakeHost({failures:[["'-a'",`vips-loader:${loader}`]]});
        Object.assign(host,{width:900,height:600,orientation:6,pages:1});
        const job=makeJob(host);
        let pngCalls=0;
        job.sources.pngCount=(path)=>{assert.equal(path,"/owned");pngCalls+=1;return 1;};
        const result=inspectSource(job,{path:"/owned",identity:"original",version:"observed"});
        assert.deepEqual(result,{path:"/owned",identity:"original",version:"observed",width:600,height:900,format,pages:1,bands:3});
        assert.equal(pngCalls,format==="PNG"?1:0);
    });
}

for(const metadata of ["xvips-loader: pngload","vips-loader:pngload trailing","vips-loader: pngload!", "vips-loader: rawload"]) {
    test(`untrusted loader text fails closed: ${metadata}`,()=>{
        const host=createFakeHost({failures:[["'-a'",metadata]]});
        assert.throws(()=>inspectSource(makeJob(host),{path:"/owned"}),(error)=>error.issues[0].code==="source-format");
    });
}

test("PNG uses ImageIO count even if vips claims one page",()=>{
    const host=createFakeHost();const job=makeJob(host);job.sources.pngCount=()=>2;
    assert.throws(()=>inspectSource(job,{path:"/owned"}),(error)=>error.issues[0].code==="source-multiple");
});

test("known non-PNG formats with absent optional frame fields remain still images",()=>{
    for(const loader of ["jpegload","tiffload","heifload","webpload"]){
        const host=createFakeHost({failures:[["'-a'",`vips-loader:  ${loader} \t`],["'n-pages'",new Error('field "n-pages" not found')]]});
        assert.equal(inspectSource(makeJob(host),{path:"/owned"}).pages,1);
    }
});

test("unknown frame counts preserve the failing backend diagnostic separately",()=>{
    const host=createFakeHost({failures:[["'-a'","vips-loader: jpegload"],["'n-pages'",new Error("cannot read frame index")]]});
    assert.throws(()=>inspectSource(makeJob(host),{path:"/owned"}),(error)=>{
        assert.equal(error.issues[0].code,"source-count");
        assert.match(error.issues[0].diagnostic.message,/cannot read frame index/u);
        assert.match(error.issues[0].diagnostic.command,/'n-pages' '\/owned'/u);
        return true;
    });
});
