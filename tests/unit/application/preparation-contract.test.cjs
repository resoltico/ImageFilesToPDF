"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { preparePage } = require("../../../src/application/pages.js");
const { OperationError } = require("../../../src/core/errors.js");
const { issuesOf } = require("../../../src/core/outcomes.js");
const { createFakeHost } = require("../ports/fake-host.cjs");
const { makeJob, imageOf } = require("../ports/fake-job.cjs");

test("normalization reads only the captured input and returns an image-sized page", () => {
    const app = createFakeHost({ files: ["/source.png"] });
    const job = makeJob(app);
    const page = preparePage(job, imageOf("/source.png"), 0);
    assert.equal(page.path, "/tmp/ImageFilesToPDF.X/0-page.png");
    assert.deepEqual([page.placement.widthPixels, page.placement.heightPixels], [595, 396]);
    const thumbnail = app.commands.find((command) => command.includes("'thumbnail'") && !command.includes("nonexistent"));
    assert.ok(thumbnail.includes("'/tmp/ImageFilesToPDF.X/input-0'"));
    assert.ok(!app.commands.some((command) => command.includes("'gravity'")));
    assert.ok(app.files.has("/source.png"));
    assert.ok(!app.files.has("/tmp/ImageFilesToPDF.X/input-0"));
});

test("programming faults during normalization retain fault meaning", () => {
    const app = createFakeHost({ files: ["/source.png"], failures: [["'thumbnail'", new TypeError("adapter bug")]] });
    assert.throws(() => preparePage(makeJob(app), imageOf("/source.png"), 0), (error) => issuesOf(error, "preparation")[0].code === "fault");
});

test("captured facts that differ from admission refuse before rendering", () => {
    for (const patch of [{ width: 601 }, { orientation: 6 }, { loader: "jpegload" }]) {
        const app = createFakeHost({ files: ["/source.png"] });
        Object.assign(app, patch);
        assert.throws(() => preparePage(makeJob(app), imageOf("/source.png"), 0), (error) => {
            assert.equal(error.issues[0].source, "/source.png");
            assert.match(error.issues[0].message, /changed after selection/u);
            return true;
        });
        assert.ok(!app.commands.some((command) => command.includes("'thumbnail'") || command.includes("'avg'")));
        assert.ok(!app.files.has("/tmp/ImageFilesToPDF.X/input-0"));
    }
});

test("missing admission is a contract fault and changed native identity is refused", () => {
    const app = createFakeHost({ files: ["/source.png"] });
    const source = imageOf("/source.png");
    assert.throws(() => preparePage(makeJob(app), { ...source, admission: undefined }, 0), /admission facts are required/u);
    const { capture } = app.sources;
    app.sources.capture = (from, to) => ({ ...capture(from, to), identity: "different" });
    assert.throws(() => preparePage(makeJob(app), source, 0), (error) => error.issues[0].code === "operation");
});

test("transparency uses an owned intermediate and reports each native operation", () => {
    const host = createFakeHost({ files: ["/source.png"], bands: 4 });
    const job = makeJob(host);
    const source = imageOf("/source.png");
    source.admission.image.bands = 4;
    const calls = [];
    const { run, verifyFile, removeFile } = job.operations;
    job.operations.run = (args, label) => { calls.push([args[1], label]); return run(args, label); };
    job.operations.verifyFile = (path, label) => { calls.push(["verify", path, label]); verifyFile(path, label); };
    job.operations.removeFile = (path) => { calls.push(["remove", path]); return removeFile(path); };
    const page = preparePage(job, source, 0);
    assert.deepEqual(calls.filter(([operation]) => ["thumbnail", "flatten", "verify", "remove"].includes(operation)), [
        ["thumbnail", "normalizing the image"], ["flatten", "flattening transparency"],
        ["verify", page.path, "prepared image"],
        ["remove", `${page.path}.v`], ["remove", `${job.workspace}/input-0`]
    ]);
    assert.ok(host.files.has(page.path));
    assert.ok(!host.files.has(`${page.path}.v`));
});

test("successful pass-through owns a verified private JPEG copy after full decoding", () => {
    const host = createFakeHost({ files: ["/source.jpg"] });
    Object.assign(host, { loader: "jpegload", width: 64, height: 48 });
    const job = makeJob(host);
    const source = imageOf("/source.jpg");
    Object.assign(source.admission.image, { loader: "jpegload", format: "JPEG", width: 64, height: 48 });
    const calls = [];
    const { run } = job.operations;
    job.operations.run = (args, label) => { calls.push([args[1], label]); return run(args, label); };
    const page = preparePage(job, source, 0);
    assert.ok(host.files.has(page.path));
    assert.ok(!host.files.has(`${job.workspace}/input-0`));
    assert.deepEqual(calls.filter(([operation]) => ["avg", "thumbnail", "flatten"].includes(operation)), [
        ["avg", "checking image data"]
    ]);
});

test("decoder failure abandons the incomplete page and reports source and stage", () => {
    const host = createFakeHost({ files: ["/source.png"] });
    const job = makeJob(host);
    const { run } = job.operations;
    const draft = `${job.workspace}/0-page.png`;
    job.operations.run = (argv, label) => {
        if (argv[1] === "thumbnail") { host.files.add(draft); throw new OperationError("Decoder refused data.", { command: "thumbnail" }); }
        return run(argv, label);
    };
    const source = imageOf("/source.png");
    assert.throws(() => preparePage(job, source, 0), (error) => {
        assert.equal(error.message, "/source.png: This image is damaged or incomplete.");
        assert.deepEqual(error.issues, [{
            code: "damaged", stage: "preparation", params: {}, source: "/source.png", message: "This image is damaged or incomplete.",
            diagnostic: { message: "Decoder refused data.", command: "thumbnail" }
        }]);
        return true;
    });
    assert.ok(!host.files.has(draft));
    assert.ok(host.files.has(source.path));
});
