"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    buildVipsProbeArgv,
    buildVipsheaderProbeArgv,
    isVipsheaderUsable,
    buildPdfcpuProbeArgv,
    isPdfcpuUsable
} = require("../../../src/backend/preflight.js");

test("the vips probe uses the flags the pipeline depends on", () => {
    const argv = buildVipsProbeArgv("/opt/homebrew/bin/vips");

    assert.ok(argv.includes("--size=down"));
    assert.ok(argv.includes("--fail-on=warning"));
    assert.ok(argv.includes("--export-profile"));
    assert.ok(argv.includes("srgb"));
    // Against a path that cannot exist, so nothing is written anywhere.
    assert.ok(argv.some((argument) => /nonexistent/u.test(argument)));
});

test("the pdfcpu version probe does not load user configuration", () => {
    assert.deepEqual(buildPdfcpuProbeArgv("/opt/homebrew/bin/pdfcpu"),
        ["/opt/homebrew/bin/pdfcpu", "version"]);
});

test("pdfcpu requires a stable release at or above the release floor", () => {
    for (const version of ["0.16.4", "0.16.5", "0.17.0", "1.0.0"]) {
        assert.equal(isPdfcpuUsable(`version: v${version}\n commit: Homebrew`), true);
    }
    for (const version of ["0.16.3", "0.16.1", "0.15.99", "0.12.1", "0.16.4-rc.1", "0.17.0-dev"]) {
        assert.equal(isPdfcpuUsable(`version: v${version}`), false);
    }
    for (const output of ["", "Segmentation fault", "configuration reset required", "version: v0.16.4junk"]) {
        assert.equal(isPdfcpuUsable(output), false);
    }
});

test("the probes name a file that cannot exist", () => {
    // The whole design: run the real tool with the real flags against a path
    // that is certain to be absent, so a tool that understands the flags
    // fails on the file and one that does not fails on the flag. An empty or
    // plausible path would make the probe a real conversion.
    const argvs = [
        buildVipsProbeArgv("/v/vips")
    ];

    for (const argv of argvs) {
        const absent = argv.filter((argument) =>
            String(argument).includes("nonexistent-image-files-to-pdf-preflight"));

        assert.ok(absent.length > 0, `no impossible path in ${argv.join(" ")}`);

        for (const argument of argv) {
            assert.notEqual(argument, "", "an empty argument is not a probe");
        }
    }
});

test("vipsheader must read the built-in one-pixel PNG, not merely be executable", () => {
    assert.deepEqual(buildVipsheaderProbeArgv("/opt/vipsheader"), ["/opt/vipsheader", "-f", "width"]);
    assert.equal(isVipsheaderUsable("1\n"), true);
    for (const output of ["", "0", "01", "600", "1 warning", "1\nwarning", null]) {
        assert.equal(isVipsheaderUsable(output), false);
    }
});

test("official pdfcpu version lines need no v prefix", () => {
    assert.equal(isPdfcpuUsable("version: 0.16.4\n commit: 0f5ac76d"), true);
    assert.equal(isPdfcpuUsable("version: 0.16.4-rc.1"), false);
});

test("the vipsheader probe image is a one-image PNG", () => {
    const { VIPSHEADER_PROBE_IMAGE } = require("../../../src/backend/preflight.js");
    const { countPng } = require("../../../src/core/png-count.js");
    const { crc32 } = require("node:zlib");
    const { Buffer } = require("node:buffer");
    const bytes = Buffer.from([...VIPSHEADER_PROBE_IMAGE.matchAll(/\\0(?<byte>[0-7]{3})/gu)].map((match) => Number.parseInt(match.groups.byte, 8)));
    assert.equal(countPng({ read: (position, size) => bytes.subarray(position, position + size), checksum: crc32 }, bytes.length), 1);
});

test("pdfcpu must be at least the minimum version, part by part", () => {
    const output = (version) => `version: v${version}`;
    for (const version of ["0.16.4", "0.16.10", "0.17.0", "1.0.0"]) { assert.equal(isPdfcpuUsable(output(version)), true, version); }
    for (const version of ["0.16.3", "0.15.99", "0.9.9"]) { assert.equal(isPdfcpuUsable(output(version)), false, version); }
});
