"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");

function checkIsolation(source) {
    const context = {};
    vm.runInNewContext(source, context);
    assert.equal(JSON.stringify(context.run()), "[1,2]");
    assert.equal(context.read, undefined);
}

async function writeModules(base) {
        await fs.writeFile(path.join(base, "a.js"), "function read(){return 1;} exports.read=read;");
        await fs.writeFile(path.join(base, "b.js"), "function read(){return 2;} exports.read=read;");
        await fs.writeFile(path.join(base, "entry.js"), 'const {read:first}=require("./a.js");const {read:second}=require("./b.js");exports.run=()=>[first(),second()];');
}

test("scoped bundle isolates duplicate private names and resolves aliases", async () => {
    const { scopedBundle } = await import("../../../tools/scoped-bundle.mjs");
    const base = await fs.mkdtemp(path.join(os.tmpdir(), "iftp-bundle-"));
    try {
        await writeModules(base);
        const result = await scopedBundle("entry.js", base);
        assert.deepEqual(result.inputs.sort(), ["a.js", "b.js", "entry.js"]);
        checkIsolation(result.source);
        await fs.writeFile(path.join(base, "entry.js"), 'exports.run=()=>require("fs");');
        await assert.rejects(() => scopedBundle("entry.js", base), /Could not resolve/u);
    } finally { await fs.rm(base, { recursive: true, force: true }); }
});

test("source discovery refuses omitted production modules", async () => {
    const { assertSourceDiscovery } = await import("../../../tools/release.mjs");
    assert.throws(() => assertSourceDiscovery(["src/core/a.js"], []), /unbundled source/u);
    assert.doesNotThrow(() => assertSourceDiscovery(["src/core/a.js"], ["src/core/a.js"]));
});

test("core and application boundaries reject host or presenter dependencies", async () => {
    const { checkBoundary } = await import("../../../tools/lint/boundaries.mjs");
    for (const source of ['ObjC.import("Foundation");', 'Application.currentApplication();', 'globalThis.$;', '$.NSView;', 'require("../runtime/form.js");']) {
        assert.throws(() => checkBoundary("src/core/example.js", source));
        assert.throws(() => checkBoundary("src/application/example.js", source));
    }
    assert.doesNotThrow(() => checkBoundary("src/core/a.js", 'require("./settings.js");'));
    assert.doesNotThrow(() => checkBoundary("src/application/a.js", 'require("./documents.js");'));
    assert.doesNotThrow(() => checkBoundary("src/runtime/a.js", 'ObjC.import("AppKit");'));
});

test("production dependency graph satisfies the enforced boundaries",async()=>{
    const {checkBoundaries}=await import("../../../tools/lint/boundaries.mjs");
    await checkBoundaries(() => Promise.resolve(["src/core/a.js"]), () => Promise.resolve('require("./settings.js");'));
    await assert.rejects(() => checkBoundaries(() => Promise.resolve(["src/core/a.js"]), () => Promise.resolve('ObjC.import("AppKit");')));
});

test("external URL imports cannot survive a standalone build",async()=>{
    const {scopedBundle}=await import("../../../tools/scoped-bundle.mjs");
    const base=await fs.mkdtemp(path.join(os.tmpdir(),"iftp-external-"));
    try {
        await fs.writeFile(path.join(base,"entry.js"),'exports.run=()=>import("https://example.invalid/module.js");');
        await assert.rejects(()=>scopedBundle("entry.js",base),/external runtime dependency/u);
    } finally { await fs.rm(base,{recursive:true,force:true}); }
});

test("bare imports cannot bypass the portable dependency boundary",async()=>{
    const {checkBoundary}=await import("../../../tools/lint/boundaries.mjs");
    assert.throws(()=>checkBoundary("src/core/a.js",'require("node:fs");'),/external dependency/u);
});
