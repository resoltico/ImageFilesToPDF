"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { inspectCandidates, inspectCaptured } = require("../../../src/application/source-inspection.js");
const { OperationError } = require("../../../src/core/errors.js");

const TOOL = "/tools/vipsheader";
const tools = { vipsheader: TOOL };
const jpeg = "/images/one.jpg";
const png = "/images/two.png";
const another = "/images/three.jpg";
const fields = { width: "64", height: "48", bands: "3", "vips-loader": "jpegload", interpretation: "srgb" };

function headers(paths, optional = {}) {
    return paths.map((file) => {
        const prefix = paths.length === 1 ? "" : `${file}: `;
        const required = { ...fields, "vips-loader": file.endsWith(".png") ? "pngload" : "jpegload" };
        return [`${file}: 64x48 uchar, 3 bands, srgb`,
            ...Object.entries({ ...required, ...optional[file] }).map(([key, value]) => `${prefix}${key}: ${value}`)].join("\n");
    }).join("\n");
}

function fixture(paths, options = {}) {
    const commands = [], counts = [], events = [];
    const progress = {
        expect: (payload) => events.push(["expect", payload]),
        checking: (...args) => events.push(["checking", ...args])
    };
    const sources = {
        facts: (path) => ({ identity: path, version: "1", size: "30" }),
        readable: () => true,
        pngCount(path) { counts.push(path); return options.pngCount ? options.pngCount() : 1; }
    };
    const selection = { images: paths.map((path) => ({ path })), rejected: [] };
    const operations = {
        toolPath: (file) => file,
        fits: options.fits ?? (() => true),
        run(argv, label) {
            commands.push([label, ...argv]);
            return options.read(argv[1], argv.slice(2));
        }
    };
    return { commands, events, counts, inspect: async () => (await inspectCandidates(operations, selection, { tools, sources, progress })), operations, sources };
}

test("headers confirm just the reported optional fields in their original order across bounded batches", async () => {
    const initial = { [jpeg]: { orientation: "1" }, [png]: { orientation: "1", "n-pages": "1", "icc-profile-data": "tag" } };
    const { commands, events, counts, inspect } = fixture([jpeg, png, another], {
        fits: (argv) => argv.length <= (argv.includes("-a") ? 4 : 5),
        read(flag, args) {
            if (flag === "-a") { return headers(args, initial); }
            return { orientation: "6\n8\n", "n-pages": "1\n", "icc-profile-data": "profile\n" }[args[0]];
        }
    });
    const result = await inspect();
    assert.deepEqual(result.images.map(({ path, admission }) => [path, admission.image.orientation, admission.image.icc]), [
        [jpeg, 6, false], [png, 8, true], [another, 1, false]
    ]);
    assert.deepEqual(result.rejected, []);
    assert.deepEqual(counts, [png]);
    assert.deepEqual(commands, [
        ["checking image headers", TOOL, "-a", jpeg, png],
        ["checking optional image metadata", TOOL, "-f", "orientation", jpeg, png],
        ["checking optional image metadata", TOOL, "-f", "n-pages", png],
        ["checking optional image metadata", TOOL, "-f", "icc-profile-data", png],
        ["checking image headers", TOOL, "-a", another]
    ]);
    assert.deepEqual(events, [
        ["expect", { units: 3, images: 3 }],
        ["checking", 0, 3, "Checking image access"], ["checking", 0, 3],
        ["checking", 2, 3], ["checking", 3, 3]
    ]);
});

test("malformed combined dumps fall back to labeled and trimmed scalar calls", async () => {
    const { inspect, commands } = fixture([jpeg], {
        read(flag, args) {
            if (flag === "-a") { throw new OperationError("Ambiguous metadata"); }
            if (args[0] === "orientation") { return "6\n"; }
            if (Object.hasOwn(fields, args[0])) { return `${fields[args[0]]}\n`; }
            throw new OperationError(`vips_image_get: field "${args[0]}" not found`);
        }
    });
    const result = await inspect();
    assert.equal(result.images[0].admission.image.orientation, 6);
    assert.equal(result.images[0].admission.image.format, "JPEG");
    assert.deepEqual(commands, [
        ["checking image headers", TOOL, "-a", jpeg],
        ["checking the image header", TOOL, "-a", jpeg],
        ...Object.keys(fields).map((field) => ["checking image metadata", TOOL, "-f", field, jpeg]),
        ...["orientation", "n-pages", "icc-profile-data"].map((field) => ["checking optional image metadata", TOOL, "-f", field, jpeg])
    ]);
});

test("header faults and content refusals retain their types, command and diagnostics", async () => {
    const cause = new OperationError("Decoder diagnostic", {
        command: "native header output", issues: [{ code: "damaged", message: "bad header", diagnostic: { detail: "truncated data" } }]
    });
    const bad = fixture([jpeg], { read() { throw cause; } });
    const result = await bad.inspect();
    assert.deepEqual(result.rejected[0], {
        path: jpeg, name: "one.jpg", code: "damaged", stage: "inspection", reason: "This image is damaged or incomplete.",
        diagnostic: { detail: "truncated data", message: "Decoder diagnostic", command: "native header output" }
    });
    await assert.rejects(() => inspectCaptured({ operations: bad.operations, tools, sources: bad.sources }, { path: jpeg }, "/selected.jpg"),
        (error) => error.message === "/selected.jpg: This image is damaged or incomplete." && error.issues[0].source === "/selected.jpg");

    const fault = new TypeError("unexpected port failure");
    const broken = fixture([jpeg], { read() { throw fault; } });
    await assert.rejects(() => inspectCaptured({ operations: broken.operations, tools, sources: broken.sources }, { path: jpeg }, jpeg), (error) => error === fault);
});
