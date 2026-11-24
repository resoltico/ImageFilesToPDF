"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { assemblePdf } = require("../../../src/application/assembly.js");
const { importBatch } = require("../../../src/application/staging.js");

function assembly() {
    const staged = "/owned/staged.pdf";
    const parts = ["/owned/part0.pdf", "/owned/part1.pdf", "/owned/part2.pdf", "/owned/part3.pdf", "/owned/part4.pdf"];
    const budgets = [], commands = [], removed = [], verified = [];
    const job = {
        tools: { pdfcpu: "/tools/pdfcpu" }, parts: new Map([[staged, parts]]), artifacts: new Map(), cleanupIssues: [],
        progress: { phase() { return undefined; } },
        operations: {
        toolPath: (file) => file,
            fits(args) { budgets.push(args); return args.slice(args.indexOf("--") + 2).length <= 2; },
            run(argv) { commands.push(argv); },
            verifyFile(file) { verified.push(file); },
            removeFile(file) { removed.push(file); return { state: "removed" }; }
        }
    };
    return { staged, parts, commands, verified, removed, budgets, job };
}

test("multi-level assembly uses bounded argv and fresh owned paths at every level", async () => {
    const { staged, parts, job, commands, verified, removed, budgets } = assembly();
    await assemblePdf(job, staged);
    const expected = ["merge-0-0", "merge-0-1", "merge-0-2", "merge-1-0", "merge-1-1"].map((part) => `${staged}.${part}.pdf`);
    assert.deepEqual(verified, [...expected, staged]);
    assert.deepEqual(removed, [...parts, ...expected]);
    assert.equal(commands.length, 6);
    assert.equal(job.parts.has(staged), false);
    assert.ok(budgets.some((args) => args.includes(`${staged}.merge-0-5.pdf`)));
});

test("a failed release stops a merge before further inputs are discarded", async () => {
    const { staged, parts, job, removed, verified } = assembly();
    job.operations.removeFile = (file) => {
        removed.push(file);
        return { state: "failed", issue: { code: "cleanup", stage: "cleanup", message: "Cannot release the fixture." } };
    };
    await assert.rejects(() => assemblePdf(job, staged), (error) => error.issues[0].source === parts[0]);
    assert.deepEqual(removed, [parts[0]]);
    assert.equal(verified.length, 1);
});

test("a staged import takes ownership before invoking pdfcpu and verifies the actual part before recording it", async () => {
    const { staged, job } = assembly();
    const part = `${staged}.part-0.pdf`;
    job.parts.set(staged, []);
    job.settings = { background: "#FFFFFF" };
    job.geometry = { widthPoints: 595.28, heightPoints: 841.89 };
    job.operations.run = () => {
        assert.equal(job.artifacts.get(part)?.state, "building");
        assert.deepEqual(job.parts.get(staged), []);
    };
    job.operations.verifyFile = (file, label) => { assert.equal(file, part); assert.equal(label, "PDF pages"); };
    await importBatch(job, staged, ["/owned/raster.jpg"], { relativeScale: 0.5 });
    assert.deepEqual(job.parts.get(staged), [part]);
});
