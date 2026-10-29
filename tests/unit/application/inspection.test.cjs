"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { inspectSelection } = require("../../../src/application/inspection.js");
const { OperationError, UserCancelled } = require("../../../src/core/errors.js");
const image = { loader: "pngload", format: "PNG", width: 600, height: 400, bands: 3, pages: 1, orientation: 1, icc: false, interpretation: "srgb" };

function fixture(count = 2, overrides = {}) {
    const events = [];
    const selection = { selectedFolders: 1, rejected: [{ path: "/notes.txt", reason: "unsupported", code: "selection-refused" }],
        images: Array.from({ length: count }, (ignored, index) => ({ path: `/source/${index}.png`, originalName: `${index}.png`, folder: "/out/" })) };
    const ports = {
        begin: (total) => events.push(["begin", total]),
        accessed: (done, total) => events.push(["access", done, total]),
        checked: (done) => events.push(["checked", done]),
        fileFacts: (source) => ({ identity: source.path, version: "v1", size: "100", readable: true }),
        batches: (entries) => entries.length > 0 ? [entries] : [],
        inspect: (entries) => { events.push(["batch", entries.map((entry) => entry.source.path)]); return entries.map(() => image); },
        inspectOne: (entry) => { events.push(["one", entry.source.path]); return image; },
        ...overrides
    };
    return { ports, selection, events };
}

test("inspection preserves ordered valid source records with structured admission facts", () => {
    const sample = fixture();
    const result = inspectSelection(sample.ports, sample.selection);
    assert.equal(result.selectedFolders, 1);
    assert.equal(result.images.length, 2);
    assert.equal(result.images[0].admission.image, image);
    assert.deepEqual(result.images[1].admission, { identity: "/source/1.png", version: "v1", image });
    assert.deepEqual(result.rejected, sample.selection.rejected);
    assert.notEqual(result.rejected, sample.selection.rejected);
    assert.deepEqual(sample.events, [["begin", 2], ["access", 0, 2], ["checked", 0], ["batch", ["/source/0.png", "/source/1.png"]], ["checked", 2]]);
});

test("access and empty-file refusals are omitted from header batches", () => {
    const sample = fixture(3, { fileFacts: (source) => ({ identity: source.path, version: "v1", size: source.path.includes("1.png") ? "0" : "100", readable: !source.path.includes("0.png") }) });
    const result = inspectSelection(sample.ports, sample.selection);
    assert.deepEqual(result.images.map((source) => source.path), ["/source/2.png"]);
    assert.deepEqual(result.rejected.slice(1).map((refusal) => refusal.code), ["unreadable", "empty"]);
    assert.deepEqual(sample.events.find(([kind]) => kind === "batch"), ["batch", ["/source/2.png"]]);
    assert.equal(sample.selection.rejected.length, 1);
});

test("a failed batch is reinspected per file and every content refusal names its source", () => {
    const sample = fixture(3, {
        inspect() { throw new OperationError("batch failed"); },
        inspectOne(entry) {
            if (entry.source.path.includes("0.png")) { return { problem: "not-an-image", diagnostic: { message: "backend text" } }; }
            return entry.source.path.includes("1.png") ? { ...image, pages: 2 } : image;
        }
    });
    const result = inspectSelection(sample.ports, sample.selection);
    assert.deepEqual(result.images.map((source) => source.path), ["/source/2.png"]);
    assert.deepEqual(result.rejected.slice(1).map((refusal) => [refusal.path, refusal.code]), [["/source/0.png", "not-an-image"], ["/source/1.png", "multiple-images"]]);
    assert.equal(result.rejected[1].diagnostic.message, "backend text");
    assert.ok(!result.rejected[1].reason.includes("backend"));
    assert.deepEqual(sample.events.filter(([kind]) => kind === "checked"), [["checked", 0], ["checked", 0], ["checked", 1], ["checked", 2], ["checked", 3]]);
});

test("unavailable source facts are refusals with a separate diagnostic", () => {
    const sample = fixture(1, { fileFacts() { throw new OperationError("attributes at /private/work unavailable"); } });
    const result = inspectSelection(sample.ports, sample.selection);
    assert.equal(result.images.length, 0);
    assert.equal(result.rejected[1].code, "unreadable");
    assert.equal(result.rejected[1].reason, "This file cannot be read; check that it still exists and that you have access.");
    assert.equal(result.rejected[1].path, "/source/0.png");
    assert.match(result.rejected[1].diagnostic.message, /private\/work/u);
    assert.doesNotMatch(result.rejected[1].reason, /private/u);
});

for (const operation of ["fileFacts", "inspect"]) {
    for (const error of [new UserCancelled(), new TypeError("adapter fault"), new OperationError("wrapped fault", { cause: new TypeError("bridge fault") })]) {
        test(`${operation} does not relabel ${error.name} as a source refusal`, () => {
            const sample = fixture(1, { [operation]() { throw error; } });
            assert.throws(() => inspectSelection(sample.ports, sample.selection), (caught) => caught === error);
        });
    }
}

test("missing batch results fail the use case before consent", () => {
    const sample = fixture(1, { inspect: () => [] });
    assert.throws(() => inspectSelection(sample.ports, sample.selection), /account for every source/u);
});

test("empty selections need no inspection capability and access checkpoints stay bounded", () => {
    const empty = fixture(0);
    assert.equal(inspectSelection({}, empty.selection), empty.selection);
    const sample = fixture(65);
    assert.equal(inspectSelection(sample.ports, sample.selection).images.length, 65);
    assert.deepEqual(sample.events.filter(([kind]) => kind === "access"), [["access", 0, 65], ["access", 32, 65], ["access", 64, 65]]);
});
