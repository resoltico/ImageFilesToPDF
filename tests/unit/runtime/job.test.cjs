"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createJob, runJob } = require("../../../src/runtime/job.js");
const { createFakeHost } = require("./fake-host.cjs");

const SETTINGS = {
    paperSize: "A4",
    orientation: "Portrait",
    dpi: 72,
    quality: 85,
    mode: "single",
    background: "#FFFFFF"
};

function job(host, settings = SETTINGS) {
    return createJob(host, settings, "20260905_010203", {
        vips: "/v/vips",
        vipsheader: "/v/vipsheader",
        pdfcpu: "/v/pdfcpu"
    });
}

test("a job carries everything a run needs, gathered once", () => {
    const host = createFakeHost({});
    const prepared = job(host);

    assert.equal(prepared.app, host);
    assert.equal(prepared.settings, SETTINGS);
    assert.equal(prepared.timestamp, "20260905_010203");
    assert.equal(prepared.tools.vips, "/v/vips");
    assert.ok(prepared.geometry.widthPoints > 0, "geometry is computed once");
    assert.ok(prepared.workspace, "a workspace is created up front");
});

test("the workspace is removed even when the run fails", () => {
    // Temporary pages would otherwise accumulate in /tmp after every error.
    const host = createFakeHost({
        files: ["/a/x.png"],
        failures: [["'import'", Object.assign(new Error("pdfcpu died"), {})]]
    });
    const prepared = job(host);

    assert.throws(() => runJob(prepared, [
        { path: "/a/x.png", originalName: "x.png" }
    ]));

    const removals = host.commands.filter((command) =>
        command.includes("/bin/rm") && command.includes(prepared.workspace));

    assert.ok(removals.length > 0, "the workspace must be cleaned up");
});

test("the mode chooses which builder runs", () => {
    const host = createFakeHost({ files: ["/a/x.png"] });
    const images = [{ path: "/a/x.png", originalName: "x.png" }];
    const combined = runJob(job(host), images);

    assert.equal(combined.outputs.length, 1);
    assert.match(combined.outputs[0], /output_20260905_010203\.pdf$/u);

    const separate = runJob(
        job(createFakeHost({ files: ["/a/x.png"] }), { ...SETTINGS, mode: "separate" }),
        images
    );

    assert.match(separate.outputs[0], /x_20260905_010203\.pdf$/u);
});
