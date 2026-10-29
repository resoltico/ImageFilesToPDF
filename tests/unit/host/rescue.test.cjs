"use strict";

/*
 * Setting aside a PDF that could not be published.
 *
 * It has been imported and validated by the time this runs, and the workspace
 * it sits in is removed as soon as the run ends — so where it goes is the
 * difference between a recoverable failure and lost work.
 */

const assert = require("node:assert/strict");
const test = require("node:test");
const { setAside } = require("../../../src/host/rescue.js");
const { createFakeHost } = require("../ports/fake-host.cjs");

const RECOVERY = "/var/folders/xx/T/ImageFilesToPDF-recovered.Fake01";

test("the PDF is copied out of the workspace, keeping its name", () => {
    const host = createFakeHost({ files: ["/tmp/ws/output_20260906.pdf"] });
    const recovered = setAside(host, "/tmp/ws/output_20260906.pdf", host.publication.facts).path;

    assert.match(recovered, /output_20260906\.pdf$/u, recovered);
    assert.ok(host.files.has(recovered), "it must exist where it was put");
    assert.ok(!host.files.has("/tmp/ws/output_20260906.pdf"), "and not where it was");
});

test("the folder it goes to is made for the purpose", () => {
    const host = createFakeHost({ files: ["/tmp/ws/a.pdf"] });

    setAside(host, "/tmp/ws/a.pdf", host.publication.facts);

    const made = host.commands.find((command) => command.includes("mktemp"));

    assert.match(made, /'-d'/u, "a directory, not a file");
    assert.match(made, /ImageFilesToPDF-recovered/u, "named so it can be found");
});

test("a PDF that cannot be copied stays where it was, and says so", () => {
    // Best effort. Claiming a rescue that did not happen would send someone
    // to a folder with nothing in it.
    const host = createFakeHost({
        files: ["/tmp/ws/a.pdf"],
        failures: [["/bin/cp", new Error("Operation not permitted")]]
    });

    assert.equal(setAside(host, "/tmp/ws/a.pdf", host.publication.facts).path, "/tmp/ws/a.pdf");
    assert.ok(host.files.has("/tmp/ws/a.pdf"), "and it is still there");
});

test("a folder that cannot be made leaves the PDF where it was", () => {
    const host = createFakeHost({
        files: ["/tmp/ws/a.pdf"],
        failures: [["mktemp", new Error("no space left")]]
    });

    assert.equal(setAside(host, "/tmp/ws/a.pdf", host.publication.facts).path, "/tmp/ws/a.pdf");
});

test("the prefix is passed as a prefix, not as a template", () => {
    // Without -t, mktemp reads the argument as a template and requires the
    // trailing X's; the folder is never made and the rescue never happens.
    const host = createFakeHost({ files: ["/tmp/ws/a.pdf"] });

    setAside(host, "/tmp/ws/a.pdf", host.publication.facts);

    assert.equal(
        host.commands.find((command) => command.includes("mktemp")),
        "'/usr/bin/mktemp' '-d' '-t' 'ImageFilesToPDF-recovered'"
    );
});

test("a host that answers with something other than a string still works", () => {
    // doShellScript answers through the ObjC bridge, and what comes back is
    // not always a JavaScript string. Trimming it directly would throw, and
    // the rescue would silently become a no-op.
    const host = createFakeHost({ files: ["/tmp/ws/a.pdf"] });
    const { doShellScript } = host;

    host.doShellScript = (command) => {
        const text = doShellScript(command);
        return { toString: () => text };
    };

    assert.equal(
        setAside(host, "/tmp/ws/a.pdf", host.publication.facts).path,
        `${RECOVERY}/a.pdf`
    );
});

test("recovery never releases an original with unknown identity or size",()=>{
    for(const original of ["", "1:2:0", "1:2:-1"]) {
        const app=createFakeHost({files:["/work/a.pdf"]});
        app.publication.facts=()=>original?{identity:"1:2",size:Number(original.split(":")[2])}:{identity:"",size:-1};
        assert.equal(setAside(app, "/work/a.pdf", app.publication.facts).path,"/work/a.pdf");
        assert.ok(app.files.has("/work/a.pdf"));
        assert.ok(!app.commands.some((command)=>command.includes("'/bin/cp'")));
    }
});

test("recovery refuses mismatched copied size and preserves the original",()=>{
    const app=createFakeHost({files:["/work/a.pdf"]});
    const {facts} = app.publication;
    app.publication.facts=(path)=>path.startsWith("/var/folders")?{identity:"1:9",size:7}:facts(path);
    assert.equal(setAside(app, "/work/a.pdf", app.publication.facts).path,"/work/a.pdf");
    assert.ok(app.files.has("/work/a.pdf"));
});

test("an original unlink failure is reported after a confirmed recovery copy",()=>{
    const app=createFakeHost({files:["/work/a.pdf"],failures:[["'/bin/rm' '-f' '/work/a.pdf'",new Error("denied")]]});
    const result=setAside(app,"/work/a.pdf",app.publication.facts);
    assert.equal(result.state,"recovered");assert.equal(result.issues[0].code,"cleanup");
    assert.ok(app.files.has("/work/a.pdf"));assert.ok(app.files.has(result.path));
});

test("a copy command failure after writing all bytes cannot release the original",()=>{
    const app=createFakeHost({files:["/work/a.pdf"]});const shell=app.doShellScript;
    app.doShellScript=(command)=>{const value=shell(command);if(command.includes("'/bin/cp'")){throw new Error("late copy failure");}return value;};
    const result=setAside(app,"/work/a.pdf",app.publication.facts);
    assert.equal(result.state,"retained");assert.equal(result.path,"/work/a.pdf");assert.ok(app.files.has("/work/a.pdf"));
    assert.equal(result.issues[0].code,"recovery");
});

test("uncertain recovery inspection preserves the original and reports failed owned cleanup",()=>{
    const app=createFakeHost({files:["/work/a.pdf"],failures:[["'/bin/rmdir'",new Error("denied")]]});
    const {facts} = app.publication;app.publication.facts=(path)=>{if(path.startsWith("/var/folders")){throw new TypeError("facts failed");}return facts(path);};
    const result=setAside(app,"/work/a.pdf",app.publication.facts);
    assert.equal(result.state,"retained");assert.ok(app.files.has("/work/a.pdf"));
    assert.deepEqual(result.issues.map((issue)=>issue.code),["fault","cleanup"]);
});

test("every recovery refusal keeps its active tagged result and diagnostic schema",()=>{
    const original="/work/a.pdf";const app=createFakeHost({files:[original]});app.publication.facts=()=>({identity:"",size:-1});
    assert.deepEqual(setAside(app,original,app.publication.facts),{state:"retained",path:original,issues:[]});
    const mismatch=createFakeHost({files:[original]});const {facts} = mismatch.publication;
    mismatch.publication.facts=(path)=>path===original?facts(path):{identity:"1:9",size:7};
    assert.deepEqual(setAside(mismatch,original,mismatch.publication.facts),{state:"retained",path:original,issues:[{code:"recovery",stage:"recovery",source:`${RECOVERY}/a.pdf`,message:"The recovery copy could not be confirmed."}]});
});

test("successful recovery reports no fabricated issues and setup failure remains recoverable",()=>{
    const original="/work/a.pdf";const app=createFakeHost({files:[original]});
    assert.deepEqual(setAside(app,original,app.publication.facts),{state:"recovered",path:`${RECOVERY}/a.pdf`,issues:[]});
    const denied=createFakeHost({files:[original],failures:[["mktemp",new Error("no space")]]});
    const kept=setAside(denied,original,denied.publication.facts);
    assert.equal(kept.state,"retained");assert.equal(kept.path,original);assert.equal(kept.issues[0].stage,"recovery");
    assert.match(kept.issues[0].message,/no space/u);
});
