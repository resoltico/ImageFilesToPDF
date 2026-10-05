"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
    buildVipsProbeArgv,
    buildPdfcpuProbeArgv,
    isVipsUsable,
    isPdfcpuUsable,
    describeSetupProblems
} = require("../../../src/core/preflight.js");

test("the vips probe uses the flags the pipeline depends on", () => {
    const argv = buildVipsProbeArgv("/opt/homebrew/bin/vips");

    assert.ok(argv.includes("--size=down"));
    assert.ok(argv.includes("--export-profile"));
    assert.ok(argv.includes("srgb"));
    // Against a path that cannot exist, so nothing is written anywhere.
    assert.ok(argv.some((argument) => /nonexistent/u.test(argument)));
});

test("the pdfcpu version probe does not load user configuration", () => {
    assert.deepEqual(buildPdfcpuProbeArgv("/opt/homebrew/bin/pdfcpu"),
        ["/opt/homebrew/bin/pdfcpu", "version"]);
});

test("vips is usable when it got as far as reaching for the file", () => {
    // The real failure for a missing file, which means the flags parsed.
    assert.equal(isVipsUsable('VipsForeignLoad: file "/x.png" does not exist'), true);
    // The real failure for a build that does not know the flag.
    assert.equal(isVipsUsable("Unknown option --export-profile"), false);
    assert.equal(isVipsUsable("Unknown option --size"), false);
});

test("a vips that said nothing at all is not usable", () => {
    // Asking that a particular complaint is absent passes silence, and a
    // binary that crashed before printing anything is silent.
    assert.equal(isVipsUsable(""), false);
    assert.equal(isVipsUsable("Segmentation fault"), false);
    assert.equal(isVipsUsable("dyld: Library not loaded: libvips.42.dylib"), false);
});

test("pdfcpu requires a stable release at or above the release floor", () => {
    for (const version of ["0.16.1", "0.16.2", "0.17.0", "1.0.0"]) {
        assert.equal(isPdfcpuUsable(`version: v${version}\n commit: Homebrew`), true);
    }
    for (const version of ["0.16.0", "0.15.99", "0.12.1", "0.16.1-rc.1", "0.17.0-dev"]) {
        assert.equal(isPdfcpuUsable(`version: v${version}`), false);
    }
    for (const output of ["", "Segmentation fault", "configuration reset required", "version: v0.16.1junk"]) {
        assert.equal(isPdfcpuUsable(output), false);
    }
});

test("a missing tool is described plainly, with the command that fixes it", () => {
    const message = describeSetupProblems(
        [{ tool: "vips", kind: "missing" }],
        true
    );

    assert.match(message, /^Setup needed\./u);
    assert.match(message, /- vips is not installed\./u);
    assert.match(message, /brew install vips pdfcpu/u);
});

test("unsupported pdfcpu reports its release requirement and upgrade command", () => {
    // "Installed" and "works" are different things, and the difference is
    // exactly what sends someone chasing a validation error instead.
    const message = describeSetupProblems(
        [{ tool: "pdfcpu", kind: "unusable", flags: "version" }],
        true
    );

    assert.match(message, /pdfcpu could not report a supported stable version/u);
    assert.match(message, /Version 0\.16\.1 or later is required/u);
    assert.match(message, /brew upgrade vips pdfcpu/u);
});

test("every problem is reported at once, not just the first", () => {
    const message = describeSetupProblems(
        [
            { tool: "vips", kind: "missing" },
            { tool: "vipsheader", kind: "missing" },
            { tool: "pdfcpu", kind: "unusable", flags: "version" }
        ],
        true
    );

    // One per line: run together they read as a single sentence about a tool
    // that does not exist, which is worse than reporting only the first.
    assert.deepEqual(message.split("\n\n")[1].split("\n"), [
        "- vips is not installed.",
        "- vipsheader is not installed.",
        "- pdfcpu could not report a supported stable version. Version 0.16.1 or later is required."
    ]);
});

test("without Homebrew, the message does not assume brew exists", () => {
    const message = describeSetupProblems([{ tool: "vips", kind: "missing" }], false);

    assert.match(message, /Install Homebrew first/u);
    assert.match(message, /https:\/\/brew\.sh/u);
    assert.match(message, /brew install vips pdfcpu/u);
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
