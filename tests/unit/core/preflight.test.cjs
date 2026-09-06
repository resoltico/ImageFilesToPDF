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

test("the pdfcpu probe uses the flag form the pipeline depends on", () => {
    const argv = buildPdfcpuProbeArgv("/opt/homebrew/bin/pdfcpu");

    assert.deepEqual(argv.slice(1, 3), ["validate", "--mode=strict"]);
    assert.ok(/nonexistent/u.test(argv[3]));
});

test("vips is usable unless it rejects a flag", () => {
    // The real failure for a missing file, which means the flags parsed.
    assert.equal(isVipsUsable('VipsForeignLoad: file "/x.png" does not exist'), true);
    assert.equal(isVipsUsable(""), true);
    // The real failure for a build that does not know the flag.
    assert.equal(isVipsUsable("Unknown option --export-profile"), false);
    assert.equal(isVipsUsable("Unknown option --size"), false);
});

test("pdfcpu is usable only when it echoes the mode it understood", () => {
    assert.equal(isPdfcpuUsable("validating(mode=strict) /x.pdf ..."), true);
    // The older parser reads the flag as a filename instead.
    assert.equal(isPdfcpuUsable('strict needs extension ".pdf".'), false);
    assert.equal(isPdfcpuUsable("mode must be one of: r(elaxed), s(trict)"), false);
    assert.equal(isPdfcpuUsable(""), false);
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

test("an outdated tool says so, and names the flags it lacks", () => {
    // "Installed" and "works" are different things, and the difference is
    // exactly what sends someone chasing a validation error instead.
    const message = describeSetupProblems(
        [{ tool: "pdfcpu", kind: "unusable", flags: "--mode=strict" }],
        true
    );

    assert.match(message, /pdfcpu is installed but too old/u);
    assert.match(message, /--mode=strict/u);
});

test("every problem is reported at once, not just the first", () => {
    const message = describeSetupProblems(
        [
            { tool: "vips", kind: "missing" },
            { tool: "vipsheader", kind: "missing" },
            { tool: "pdfcpu", kind: "unusable", flags: "--mode=strict" }
        ],
        true
    );

    // One per line: run together they read as a single sentence about a tool
    // that does not exist, which is worse than reporting only the first.
    assert.deepEqual(message.split("\n\n")[1].split("\n"), [
        "- vips is not installed.",
        "- vipsheader is not installed.",
        "- pdfcpu is installed but too old: it does not accept --mode=strict."
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
        buildVipsProbeArgv("/v/vips"),
        buildPdfcpuProbeArgv("/v/pdfcpu")
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
