"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const crypto=require("node:crypto");
const {spawnSync,execFileSync}=require("node:child_process");
const [artifact,work,volume,label,expected]=process.argv.slice(2);
const root=path.join(volume,"naming-contract");fs.mkdirSync(root);
const settings=path.join(root,"settings.json");
fs.writeFileSync(settings,JSON.stringify({mode:"separate",paperSize:"A4",orientation:"Portrait",resolutionLimit:300,quality:92,background:"#FFFFFF",timestamp:"20261030_010203"}));
const hash=(file)=>crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

function alias(folder,left,right) {
    const first=path.join(folder,left),second=path.join(folder,right);
    fs.writeFileSync(first,"owned naming oracle",{flag:"wx"});
    let same=false;
    try {fs.writeFileSync(second,"second owned marker",{flag:"wx"});fs.unlinkSync(second);}
    catch(error) {if(error.code!=="EEXIST") {throw error;} same=true;}
    assert.equal(fs.readFileSync(first,"utf8"),"owned naming oracle");
    if(same) {assert.equal(fs.readFileSync(second,"utf8"),"owned naming oracle");}
    fs.unlinkSync(first);return same;
}
function sources(folder,left,right) {
    fs.mkdirSync(folder);
    const records=[{path:path.join(folder,`${left}.jpg`),originalName:`${left}.jpg`,folder:`${folder}/`},
        {path:path.join(folder,`${right}.png`),originalName:`${right}.png`,folder:`${folder}/`}];
    records.forEach((record,index)=>fs.copyFileSync(path.join(work,index===0?"photo.jpg":"photo.png"),record.path));
    return records;
}
function groups(records) {
    const result=spawnSync("/usr/bin/osascript",["-l","JavaScript",path.join(work,"names.jxa"),JSON.stringify(records),work],{encoding:"utf8",timeout:10000});
    assert.ifError(result.error);assert.equal(result.status,0,result.stderr);
    return JSON.parse(result.stdout);
}
function convert(records,wanted,protectedFile=null) {
    const before=records.map(record=>hash(record.path));
    const protectedHash=protectedFile?hash(protectedFile):null;
    const result=spawnSync("/usr/bin/osascript",["-l","JavaScript",artifact,"--headless",settings,...records.map(record=>record.path)],{encoding:"utf8",timeout:60000});
    assert.ifError(result.error);assert.equal(result.status,0,result.stderr);
    const receipt=JSON.parse(result.stdout);
    assert.equal(receipt.state,"complete");assert.equal(receipt.documents.length,2);
    for(const document of receipt.documents) {
        assert.equal(document.state,"saved");assert.equal(document.pages,1);
        const index=document.sources[0].endsWith(".jpg")?0:1;
        assert.equal(path.basename(document.output).normalize("NFC"),wanted[index].normalize("NFC"));
        execFileSync("qpdf",["--check",document.output],{stdio:"pipe"});
    }
    assert.deepEqual(records.map(record=>hash(record.path)),before,"source bytes unchanged");
    if(protectedFile) {assert.equal(hash(protectedFile),protectedHash,"occupied name preserved");}
    return receipt.documents.map(document=>path.basename(document.output));
}

function pair(index,left,right,options={}) {
    const folder=path.join(root,`pair-${index}`),records=sources(folder,left,right);
    const oracle=path.join(root,`oracle-${index}`);fs.mkdirSync(oracle);
    const leftName=options.bareLeft??left,rightName=options.bareRight??right;
    const same=alias(oracle,`${leftName}.pdf`,`${rightName}.pdf`);
    const actual=groups(records);
    const diagnostic=(actual[0]===actual[1])===same?"":spawnSync("/usr/bin/osascript",["-l","JavaScript",path.join(work,"names.jxa"),JSON.stringify(records),work,"details"],{encoding:"utf8"});
    assert.equal(actual[0]===actual[1],same,`${label}: ${left}/${right} native equivalence ${diagnostic.stdout??""} ${diagnostic.stderr??""}`);
    let saved=[];
    if(label!=="exfat"&&options.production) {
        const wanted=same?[`${leftName}-jpg.pdf`,`${rightName}-png.pdf`]:[`${leftName}.pdf`,`${rightName}.pdf`];
        const occupied=path.join(folder,wanted[0]);fs.writeFileSync(occupied,"keep this existing entry",{flag:"wx"});
        const numbered=[wanted[0].replace(/\.pdf$/u," 2.pdf"),wanted[1]];
        saved=convert(records,numbered,occupied);
    }
    // Diagnostic output records the independently observed namespace oracle.
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({volume:label,left,right,alias:same,groups:actual,saved}));
}

function folderAliases() {
    const parent=path.join(root,"Folder");fs.mkdirSync(parent);
    const same=fs.existsSync(path.join(root,"folder"));
    if(!same) {fs.mkdirSync(path.join(root,"folder"));}
    const records=sources(path.join(parent,"images"),"photo","other");
    if(same) {
        fs.copyFileSync(path.join(work,"photo.png"),path.join(parent,"images","photo.png"));
        records[1]={path:path.join(root,"folder/images/photo.png"),originalName:"photo.png",folder:`${root}/folder/images/`};
    } else {
        const lower=path.join(root,"folder/images");fs.mkdirSync(lower);
        fs.copyFileSync(path.join(work,"photo.png"),path.join(lower,"photo.png"));
        records[1]={path:path.join(lower,"photo.png"),originalName:"photo.png",folder:`${lower}/`};
    }
    const actual=groups(records);assert.equal(actual[0]===actual[1],same,"folder spellings use actual directory identity");
    if(label!=="exfat") {convert(records,same?["photo-jpg.pdf","photo-png.pdf"]:["photo.pdf","photo.pdf"]);}
}

function normalizedFolders() {
    const parent=path.join(root,"Caf\u00e9");fs.mkdirSync(parent);
    const other=path.join(root,"Cafe\u0301"),same=fs.existsSync(other);
    if(!same) {fs.mkdirSync(other);}
    const records=[{path:path.join(parent,"photo.jpg"),folder:`${parent}/`,originalName:"photo.jpg"},
        {path:path.join(other,"photo.png"),folder:`${other}/`,originalName:"photo.png"}];
    records.forEach((record,index)=>fs.copyFileSync(path.join(work,index===0?"photo.jpg":"photo.png"),record.path));
    const actual=groups(records);assert.equal(actual[0]===actual[1],same,"normalization aliases use directory identity");
    if(label!=="exfat") {convert(records,same?["photo-jpg.pdf","photo-png.pdf"]:["photo.pdf","photo.pdf"]);}
}

function hardLinks() {
    if(label==="fat32"||label==="exfat") {return;}
    const records=sources(path.join(root,"hard-links"),"i","\u0131");
    fs.linkSync(records[0].path,path.join(root,"hard-links/\u0131.jpg"));
    const actual=groups(records);assert.notEqual(actual[0],actual[1],"different hard-link names are not name aliases");
    convert(records,["i.pdf","\u0131.pdf"]);
}

const insensitive=alias(root,"case-probe.pdf","CASE-PROBE.PDF");
if(expected!=="measure") {assert.equal(insensitive,expected==="insensitive",`${label}: control volume has requested case sensitivity`);}
pair(0,"photo","PHOTO",{production:true});
pair(1,"photo","photo",{production:true});
for(const [index,left,right] of [[2,"caf\u00e9","cafe\u0301"],[3,"\u00c5","\u212b"],[4,"stra\u00dfe","STRASSE"],[5,"photo","photo\u200d"],[6,"\u03c3","\u03c2"],[7,"i","\u0131"],[8,"\u212a","K"],[9,"\u00df","\u1e9e"],[10,"\u00dfS","S\u00df"]]) {
    pair(index,left,right);
}
if(label!=="fat32"&&label!=="exfat") {pair(11,"caf\u00e9:Photo","CAF\u00c9:photo",{bareLeft:"caf\u00e9_Photo",bareRight:"CAF\u00c9_photo",production:true});}
folderAliases();normalizedFolders();hardLinks();
