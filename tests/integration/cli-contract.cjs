"use strict";
const {Buffer} = require("node:buffer");
const {setTimeout} = require("node:timers");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const {spawnSync, execFileSync, spawn} = require("node:child_process");
const {once} = require("node:events");
const [script, work] = process.argv.slice(2);
const owned = new Set();
let activeChild=null;
const settings = {mode:"combined", paperSize:"A4", orientation:"Portrait", background:"#FFFFFF", resolutionLimit:300, quality:92, timestamp:"20261029_010203"};
const config = path.join(work,"settings.json");
fs.writeFileSync(config,JSON.stringify(settings));
const at = (name) => path.join(work,name);

function command(status, args, options={}) {
    const result = spawnSync("/usr/bin/osascript",["-l","JavaScript",script,...args],{cwd:work,encoding:"utf8",timeout:60000,...options});
    assert.ifError(result.error);
    assert.equal(result.signal,null, result.stderr);
    assert.equal(result.status,status,`${args.join(" ")}\n${result.stderr}\n${result.stdout}`);
    assert.doesNotMatch(result.stderr,/execution error|\(-2700\)|\n\s+at \w|"diagnostic"/u);
    return result;
}
function convert(status, files, file=config, options={}) {
    const result=command(status,["--","--headless",file,...files],options);
    assert.equal(result.stdout.trim().split("\n").length,1,"one receipt line");
    const receipt=JSON.parse(result.stdout);
    assert.ok(["complete","incomplete","invalid","cancelled"].includes(receipt.state));
    return receipt;
}
function saved(receipt) {
    assert.equal(receipt.state,"complete");
    assert.equal(receipt.documents.length,1);
    assert.equal(receipt.documents[0].state,"saved");
    return receipt.documents[0].output;
}
function extracted(pdf, name) {
    const prefix=at(name);
    execFileSync("pdfimages",["-j",pdf,prefix]);
    const file=fs.readdirSync(work).find((item)=>item.startsWith(`${name}-`)&&item.endsWith(".jpg"));
    assert.ok(file,"JPEG extraction exists");
    return fs.readFileSync(at(file));
}
function refusal(receipt, filename, code) {
    const item=receipt.rejected.find((entry)=>entry.path===at(filename));
    assert.ok(item,`${filename} is refused before conversion`);
    assert.equal(item.code,code,JSON.stringify(item));
    assert.doesNotMatch(item.reason,/ImageFilesToPDF\.|vips|\r/u);
}
function settingsError(filename, contents, cause) {
    if (contents!==undefined) {fs.writeFileSync(at(filename),contents);}
    const receipt=convert(2,["photo.jpg"],filename);
    assert.equal(receipt.state,"invalid");
    assert.equal(receipt.documents.length,0);
    assert.ok(receipt.issues.some((issue)=>issue.message.includes(at(filename))&&cause.test(issue.message)),JSON.stringify(receipt.issues));
}

function workspaceOf(pid) {
    for(const name of fs.readdirSync(os.tmpdir()).filter((item)=>/^ImageFilesToPDF\.[A-Za-z0-9]{10}$/u.test(item))) {
        const candidate=path.join(os.tmpdir(),name);
        try {if(JSON.parse(fs.readFileSync(path.join(candidate,"owner.json"),"utf8")).pid===pid) {return candidate;}}
        catch {
            // A candidate belonging to another process is never ours.
        }
    }
    return null;
}

async function ownership() {
    const input=at("many");fs.mkdirSync(input);
    for(let index=0;index<200;index+=1) {fs.copyFileSync(at("photo.jpg"),path.join(input,`${index}.jpg`));}
    const child=spawn("/usr/bin/osascript",["-l","JavaScript",script,"--headless",config,input],{stdio:"ignore"});
    activeChild=child;
    let orphan=null;
    for(let attempt=0;attempt<200&&!orphan;attempt+=1) {
        orphan=workspaceOf(child.pid);
        if(!orphan) {
            // Poll this process's owner registration before delivering TERM.
            // eslint-disable-next-line no-await-in-loop
            await new Promise((resolve)=>{setTimeout(resolve,50);});
        }
    }
    assert.ok(orphan,"actual run registered its owner before TERM");owned.add(orphan);
    const ended=once(child,"exit");child.kill("SIGTERM");await ended;
    assert.ok(fs.existsSync(orphan),"TERM left an observable orphan");
    const retained=execFileSync("mktemp",["-d","-t","ImageFilesToPDF"],{encoding:"utf8"}).trim();owned.add(retained);
    fs.writeFileSync(path.join(retained,"owner.json"),JSON.stringify({pid:2147483647,started:"not a live process"}));
    fs.writeFileSync(path.join(retained,"retain"),"");
    const receipt=convert(0,["photo.jpg"]);
    assert.ok(!fs.existsSync(orphan),"next startup reclaims the child-owned orphan");
    assert.ok(fs.existsSync(retained),"dead retained workspace survives");
    assert.ok(receipt.diagnostics.some((entry)=>entry.code==="workspace-retained"&&entry.diagnostic.path===retained));
}

function grammar() {
    for(const args of [[],["--headless"],["--headless",config],["--bogus"]]) {
        const started=Date.now();const result=command(2,args,{timeout:2000});
        assert.ok(Date.now()-started<2000);assert.equal(JSON.parse(result.stdout).state,"invalid");assert.match(result.stderr,/Usage:/u);
    }
    const help=command(0,["--help"],{timeout:2000});
    for(const name of ["PDF files","Paper size","Orientation","Page background","Maximum resolution","JPEG quality"]) {assert.ok(help.stdout.includes(name));}
    const {version}=require("../../package.json");
    assert.equal(command(0,["--version"],{timeout:2000}).stdout,`Image Files to PDF ${version}\n`);
}

function readerErrors() {
    settingsError("missing.json",undefined,/not found/u);
    fs.mkdirSync(at("folder.json"));settingsError("folder.json",undefined,/folder/u);
    settingsError("empty.json","",/empty/u);
    settingsError("bytes.json",Buffer.from([255,254,255]),/UTF-8/u);
    settingsError("syntax.json","{",/not valid JSON/u);
    settingsError("array.json","[]",/not an object/u);
    for(const [filename,changes,cause] of [["invalid.json",{resolutionLimit:1018},/Maximum resolution/u],["calendar.json",{timestamp:"20260230_010203"},/timestamp/u]]) {
        fs.writeFileSync(at(filename),JSON.stringify({...settings,...changes}));
        const receipt=convert(2,["photo.jpg"],filename);
        assert.equal(receipt.state,"invalid");assert.ok(receipt.issues.some((issue)=>cause.test(issue.message)));
    }
}

function descriptionJpeg(original) {
    const description=Buffer.from("A real photo\norientation: 6\nn-pages: 2\nicc-profile-data: fake\0");
    const tiff=Buffer.alloc(26+description.length);
    tiff.write("II");tiff.writeUInt16LE(42,2);tiff.writeUInt32LE(8,4);
    tiff.writeUInt16LE(1,8);tiff.writeUInt16LE(0x010e,10);tiff.writeUInt16LE(2,12);
    tiff.writeUInt32LE(description.length,14);tiff.writeUInt32LE(26,18);description.copy(tiff,26);
    const payload=Buffer.concat([Buffer.from("Exif\0\0"),tiff]);
    const marker=Buffer.alloc(4);marker.writeUInt16BE(0xffe1,0);marker.writeUInt16BE(payload.length+2,2);
    const described=Buffer.concat([original.subarray(0,2),marker,payload,original.subarray(2)]);
    fs.writeFileSync(at("description.jpg"),described);
    const rawHeader=execFileSync("vipsheader",["-a",at("description.jpg")],{encoding:"utf8"});
    assert.ok(rawHeader.includes("n-pages: 2"),"adversarial text reaches the real header transport");
    return described;
}

function embedding() {
    const pdf=saved(convert(0,["photo.jpg"]));
    assert.equal(path.basename(pdf),"Images 2026-10-29 at 01.02.03.pdf");
    const original=fs.readFileSync(at("photo.jpg"));
    assert.deepEqual(extracted(pdf,"unchanged"),original,"eligible JPEG stream stays byte-identical");
    const second=saved(convert(0,["photo.jpg"]));assert.equal(path.basename(second),"Images 2026-10-29 at 01.02.03 2.pdf");
    assert.deepEqual(extracted(pdf,"still-original"),original,"collision preserved the first PDF");
    const described=descriptionJpeg(original);
    fs.writeFileSync(at("description.jpg"),described);
    const describedPdf=saved(convert(0,["description.jpg"]));
    assert.deepEqual(extracted(describedPdf,"description"),described,"metadata text cannot forge optional image facts");
    const tagged=saved(convert(0,["tagged.jpg"]));
    assert.notDeepEqual(extracted(tagged,"converted"),fs.readFileSync(at("tagged.jpg")),"ICC JPEG is normalized");
    return {pdf,original};
}

function placementAndNaming(pdf) {
    const qdf=execFileSync("qpdf",["--qdf","--object-streams=disable",pdf,"-"],{encoding:"latin1"});
    assert.match(qdf,/400(?:\.0+)? 0(?:\.0+)? 0(?:\.0+)? 200(?:\.0+)? 97\.6\d* 320\.9\d* cm/u,"natural-size centered placement");
    assert.match(qdf,/ rg .* re [Bf]/u,"vector page background");
    const separate=at("separate.json");fs.writeFileSync(separate,JSON.stringify({...settings,mode:"separate"}));
    const names=convert(0,["photo.jpg","photo.png"],separate).documents.map((document)=>path.basename(document.output)).sort();
    assert.deepEqual(names,["photo-jpg.pdf","photo-png.pdf"]);
    assert.equal(path.basename(saved(convert(0,["photo.jpg"],separate))),"photo.pdf");
    assert.equal(path.basename(saved(convert(0,["photo.jpg"],separate))),"photo 2.pdf");
    return separate;
}

function refusals(pdf,separate) {
    const setup=convert(3,["photo.jpg"],config,{env:{...process.env,IMAGE_FILES_TO_PDF_VIPS:"/usr/bin/true"}});
    assert.ok(setup.issues.some((issue)=>issue.stage==="setup"));
    fs.writeFileSync(at("empty.png"),"");fs.copyFileSync(at("source.svg"),at("vector.png"));
    fs.copyFileSync(pdf,at("document.png"));fs.writeFileSync(at("random.jpg"),"not an image");
    fs.copyFileSync(at("photo.jpg"),at("unreadable.jpg"));fs.chmodSync(at("unreadable.jpg"),0);
    const corpus=["empty.png","vector.png","document.png","random.jpg","multi.tif","animated.webp","unreadable.jpg","photo.jpg"];
    const refused=convert(1,corpus,separate);
    for(const [name,code] of [["empty.png","empty"],["vector.png","not-an-image"],["document.png","not-an-image"],["random.jpg","not-an-image"],["multi.tif","multiple-images"],["animated.webp","multiple-images"],["unreadable.jpg","unreadable"]]) {refusal(refused,name,code);}
    assert.equal(refused.documents.length,1);assert.equal(refused.documents[0].state,"saved");
}

async function run() {
    grammar();readerErrors();
    const {pdf,original}=embedding();
    const separate=placementAndNaming(pdf);refusals(pdf,separate);
    await ownership();
    assert.deepEqual(fs.readFileSync(at("photo.jpg")),original,"source bytes untouched");
    // eslint-disable-next-line no-console
    console.log("macOS CLI integration passed: grammar/statuses, native reader, refusals, naming, embedding, placement and workspace ownership");
}
// eslint-disable-next-line no-console
run().catch((error)=>{console.error(error);process.exitCode=1;}).finally(async()=>{
    if(activeChild&&activeChild.exitCode===null&&activeChild.signalCode===null) {
        const ended=once(activeChild,"exit");activeChild.kill("SIGKILL");await ended;
    }
    for(const directory of owned) {fs.rmSync(directory,{recursive:true,force:true});}
});
