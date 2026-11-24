"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { assemblePdf } = require("../../../src/application/assembly.js");
const { collectImageFiles } = require("../../../src/application/admission.js");
const { selectedItems } = require("../../../src/application/selection.js");
const { executeDocuments } = require("../../../src/application/documents.js");
const { inspectCandidates } = require("../../../src/application/source-inspection.js");
const { publishPdf } = require("../../../src/application/publish.js");
const { keep } = require("../../../src/application/recovery.js");
const { unconfirmedClaim } = require("../../../src/application/publication-name.js");
const { createProgress } = require("../../../src/application/progress.js");
const { OperationError } = require("../../../src/core/errors.js");
const { treeOf } = require("../ports/fake-tree.cjs");
const { fixture } = require("../application/fixture-documents.cjs");
const { createConversionFixture } = require("../ports/fake-conversion.cjs");
const { makeJob, imageOf, preparePage } = require("../ports/fake-job.cjs");

test("a drive root already supplies its directory separator and a trailing slash requires a directory", async () => {
    const tree = treeOf({ "C:/": ["p.png"] });
    tree.standardize = (value) => value === "C:/" ? value : value.replace(/\/+$/u, "");
    tree.entries = (value) => value === "C:/" ? ["p.png"] : [];
    tree.inspect = (value) => ({ kind: value === "C:/" ? "directory" : "file", identity: value });
    const selection = (await collectImageFiles({ fileKind: () => "file" }, [{ path: "C:/" }, { path: "C:/readme/" }], tree));
    assert.deepEqual(selection.images.map((entry) => entry.folder), ["C:/"]);
    assert.equal(selection.rejected[0].code, "not-a-folder");
    assert.equal((await selectedItems(tree, [{ path: "C:/" }], []))[0].kind, "directory");
});

test("one oversized page fails explicitly before import and releases the queue", async () => {
    const { ports, events, owned, plans } = fixture(1, { argv: 0 });
    const [record] = (await executeDocuments(ports, plans));
    assert.equal(record.state, "failed");
    assert.equal(record.issues[0].stage, "import");
    assert.match(record.issues[0].message, /argument budget/u);
    assert.ok(!events.some(([name]) => name === "import"));
    assert.equal(owned.size, 0);
});

test("merge assembles multiple levels and rejects a budget that cannot reduce even a pair", async () => {
    const parts = Array.from({ length: 33 }, (unused, index) => `/work/part-${index}.pdf`);
    const host = createConversionFixture({ files: parts });
    const job = makeJob(host);
    const staged = "/work/ready.pdf";
    job.parts.set(staged, []);
    await assert.rejects(() => assemblePdf(job, staged), /No PDF pages/u);
    job.parts.set(staged, parts.slice(0, 2));
    job.operations.fits = (argv) => argv.length === 8;
    await assert.rejects(() => assemblePdf(job, staged), /could not reduce/u);
    job.operations.fits = () => true;
    job.parts.set(staged, parts);
    const outputs = [];
    const { run, verifyFile } = job.operations;
    job.operations.run = (argv, label) => {
        assert.equal(label, "assembling PDF");
        const [,,,,,, output] = argv;
        if (output !== staged) { assert.equal(job.artifacts.get(output).state, "building"); }
        outputs.push(output);
        return run(argv, label);
    };
    job.operations.verifyFile = (file, label) => { assert.equal(label, "assembled PDF"); verifyFile(file, label); };
    (await assemblePdf(job, staged));
    assert.deepEqual(outputs, [`${staged}.merge-0-0.pdf`, `${staged}.merge-0-1.pdf`, staged]);
    assert.ok(host.files.has(staged));
    assert.ok(parts.every((part) => !host.files.has(part)));
    assert.equal(job.parts.has(staged), false);
});

test("eligible JPEG passes through only after full decode; a native issue without argv becomes damage", async () => {
    const host = createConversionFixture({ files: ["/source.jpg"] });
    Object.assign(host, { loader: "jpegload", width: 64, height: 48 });
    const source = imageOf("/source.jpg");
    Object.assign(source.admission.image, { loader: "jpegload", format: "JPEG", width: 64, height: 48, gainMap: false });
    const job = makeJob(host);
    assert.match((await preparePage(job, source, 0)).path, /0-page\.jpg$/u);
    assert.ok(host.commands.some((command) => command.includes("avg")));
    const { run } = job.operations;
    job.operations.run = (argv, label) => { if (argv.includes("avg")) { throw new OperationError("Unreadable scan."); } return run(argv, label); };
    await assert.rejects(() => preparePage(job, source, 1), (error) => error.issues[0].code === "damaged" && error.issues[0].diagnostic.command === "");
});

test("PNG count faults and damaged headers remain visible on the original source", async () => {
    const source = imageOf("/source.png");
    const host = createConversionFixture({ files: [source.path] });
    const { tools } = makeJob(host);
    const progress = createProgress([]);
    const selection = { images: [source], rejected: [] };
    for (const error of [new OperationError("Cannot count"), new OperationError("Bad PNG", { issues: [{ code: "damaged", message: "Bad PNG", diagnostic: { detail: "test" } }] })]) {
        const sources = { ...host.sources, pngCount() { throw error; } };
        // eslint-disable-next-line no-await-in-loop -- Complete and inspect this fixture before the next case.
        const result = (await inspectCandidates(host.operations, selection, { tools, sources, progress }));
        assert.equal(result.rejected[0].code, "damaged");
        assert.equal(result.rejected[0].path, source.path);
    }
});

test("an ambiguous claim with no verified original yields no recovery path", () => {
    const original = { identity: "expected", size: 8 };
    const error = unconfirmedClaim({ facts: () => ({ identity: "foreign", size: 8 }) },
        { staged: "/private/file.pdf", original, path: "/public/file.pdf", claimed: original });
    assert.equal(error.recovery, null);
    assert.equal(error.issues[0].code, "fault");
});

function publicationFixture() {
    const staged = "/work/ready.pdf";
    const host = createConversionFixture({ files: [staged] });
    const job = makeJob(host);
    job.artifacts.set(staged, { path: staged, state: "validated" });
    return { host, job, staged, target: "/public/out.pdf" };
}

test("measurement errors after a claim preserve the confirmed private path", async () => {
    const { host, job, staged, target } = publicationFixture();
    const { facts } = host.publication;
    host.publication.facts = (file) => {
        if (file === target) { throw new Error("Lost acknowledgement"); }
        return facts(file);
    };
    await assert.rejects(() => publishPdf(job, staged, target), (error) => error.recovery === staged && error.issues[0].diagnostic.detail === "Lost acknowledgement");
    assert.ok(host.files.has(staged));
    assert.ok(host.files.has(target));
});

test("recovery checks destination sizes and retains the private original on ambiguous acknowledgement", async () => {
    const { host, job, staged, target } = publicationFixture();
    const { facts, link } = host.publication;
    host.publication.link = (from, to) => to === target ? { state: "denied", diagnostic: { message: "Permission denied." } } : link(from, to);
    host.publication.facts = (file) => file.startsWith("/Downloads/") ? { ...facts(file), size: 7 } : facts(file);
    await assert.rejects(() => publishPdf(job, staged, target), (error) => error.recovery === staged);
    assert.ok(host.files.has(staged));
    assert.ok(host.files.has("/Downloads/out.pdf"));
    await assert.rejects(() => keep(job, { staged }, {}), /intent is required/u);
});

test("ambiguous batched vips headers are confirmed individually", async () => {
    const files = ["/first.png", "/second.png"];
    const host = createConversionFixture({ files });
    const { operations } = host;
    const { run } = operations;
    operations.run = (argv, label) => {
        if (argv[1] === "-a" && argv.length > 3) { throw new OperationError("Ambiguous combined response."); }
        return run(argv, label);
    };
    const { tools } = makeJob(host);
    const result = (await inspectCandidates(operations, { images: files.map(imageOf), rejected: [] },
        { tools, sources: host.sources, progress: createProgress([]) }));
    assert.deepEqual(result.images.map((image) => image.path), files);
    assert.equal(host.commands.filter((command) => command.includes("-a")).length, 2);
});

test("cross-device Downloads recovery reports its native cause and any cleanup failure", async () => {
    const { host, job, staged, target } = publicationFixture();
    const { link } = host.publication;
    host.publication.link = (from, to) => {
        if (to === target) { return { state: "denied", diagnostic: { message: "Permission denied." } }; }
        return from === staged ? { state: "cross-device" } : link(from, to);
    };
    job.operations.removeFile = () => ({ state: "failed", issue: { code: "cleanup", stage: "cleanup", message: "Could not remove the original." } });
    await assert.rejects(() => publishPdf(job, staged, target), (error) => {
        assert.equal(error.recovery, "/Downloads/out.pdf");
        assert.equal(error.issues[0].diagnostic.message, "Permission denied.");
        assert.ok(error.issues.some((issue) => issue.code === "cleanup"));
        return true;
    });
    assert.ok(host.files.has(staged));
    assert.ok(host.files.has("/Downloads/out.pdf"));
});

test("a blank native destination detail falls back to the operation error", async () => {
    const { host, job, staged, target } = publicationFixture();
    const { link } = host.publication;
    host.publication.link = (from, to) => to === target ? { state: "denied", diagnostic: { message: " " } } : link(from, to);
    await assert.rejects(() => publishPdf(job, staged, target), (error) =>
        error.issues[0].diagnostic.message === "The PDF destination could not be claimed (denied).");
});

test("missing an individual native operation fails before reclamation or selection", async () => {
    const { execute } = require("../../../src/application/workflow.js");
    const host = createConversionFixture();
    const { storage, publication, sources, destinationNames } = host;
    const tree = treeOf({});
    const invocation = { inputItems: ["/source.png"] };
    const progress = createProgress([]);
    const capabilities = { tree, storage, publication, sources, destinationNames };
    const interaction = { progress, collect: () => invocation };
    const { tools } = makeJob(host);
    let reclaimed = false;
    const run = (ports) => execute(invocation, { interaction, capabilities: ports, operations: host.operations, checkTools: () => tools, reclaim() { reclaimed = true; return []; } });
    for (const field of ["facts", "readable", "capture", "pngCount"]) {
        const incomplete = { ...capabilities, sources: { ...sources, [field]: undefined } };
        // eslint-disable-next-line no-await-in-loop -- Complete and inspect this fixture before the next case.
        await assert.rejects(() => run(incomplete), /Required filesystem\/source capabilities/u);
    }
    await assert.rejects(() => run({ ...capabilities, destinationNames: {} }),
        /Required filesystem\/source capabilities/u);
    assert.equal(reclaimed, false);
});

test("a mixed resource cleanup error keeps cancellation and takes an independent diagnostic snapshot", () => {
    const { requireReleasedResources } = require("../../../src/application/owned-cleanup.js");
    const { UserCanceled } = require("../../../src/core/errors.js");
    const cleanup = { code: "cleanup", stage: "cleanup", message: "A temporary file could not be removed." };
    const canceled = { code: "canceled", stage: "cleanup", message: "User canceled." };
    const job = { cleanupIssues: [cleanup, canceled] };
    assert.throws(() => requireReleasedResources(job), (error) => {
        assert.ok(error instanceof UserCanceled);
        assert.deepEqual(error.issues, [cleanup, canceled]);
        assert.notEqual(error.issues, job.cleanupIssues);
        return true;
    });
    job.cleanupIssues.pop();
    assert.throws(() => requireReleasedResources(job), (error) => {
        assert.equal(error.message, "Owned temporary work could not be released; conversion stopped to preserve the resource bound.");
        assert.deepEqual(error.issues, [cleanup]);
        assert.notEqual(error.issues, job.cleanupIssues);
        return true;
    });
});
