"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { TOOL_NAMES, findTool } = require("../../../src/runtime/tools.js");
const { createFakeApp, failing } = require("./fake-app.cjs");

const HOMEBREW = "/opt/homebrew/bin/vips";

test("every tool the pipeline needs is named", () => {
    assert.deepEqual(TOOL_NAMES, ["vips", "vipsheader", "pdfcpu"]);
});

test("an environment override wins when it is executable", () => {
    const app = createFakeApp([["printenv", "/custom/vips\n"]]);

    assert.equal(findTool(app, "vips"), "/custom/vips");
});

test("an unset environment variable is not an error", () => {
    const app = createFakeApp([["printenv", failing("1")]]);

    assert.equal(findTool(app, "vips"), HOMEBREW);
});

test("an override that is not executable is ignored", () => {
    const app = createFakeApp([
        ["printenv", "/custom/vips\n"],
        ["'/custom/vips'", failing("1")]
    ]);

    assert.equal(findTool(app, "vips"), HOMEBREW);
});

test("the first executable candidate is used", () => {
    const app = createFakeApp([
        ["printenv", failing("1")],
        ["'/opt/homebrew/bin/vips'", failing("1")]
    ]);

    assert.equal(findTool(app, "vips"), "/usr/local/bin/vips");
});

test("PATH is searched when no candidate exists", () => {
    const app = createFakeApp([
        ["printenv", failing("1")],
        ["'/opt/homebrew/bin/vips'", failing("1")],
        ["'/usr/local/bin/vips'", failing("1")],
        ["'/opt/local/bin/vips'", failing("1")],
        ["command -v", "/opt/local/other/vips\n"]
    ]);

    assert.equal(findTool(app, "vips"), "/opt/local/other/vips");
});

test("a PATH hit that is not executable is not accepted", () => {
    const app = createFakeApp([
        ["printenv", failing("1")],
        ["'/opt/homebrew/bin/vips'", failing("1")],
        ["'/usr/local/bin/vips'", failing("1")],
        ["'/opt/local/bin/vips'", failing("1")],
        ["command -v", "/weird/vips\n"],
        ["'/weird/vips'", failing("1")]
    ]);

    assert.equal(findTool(app, "vips"), "");
});

test("a missing tool is reported as absent rather than thrown", () => {
    // The preflight collects every problem, so absence must be a value.
    const app = createFakeApp([["", failing("1")]]);

    assert.equal(findTool(app, "pdfcpu"), "");
});

test("each tool has its own environment override, under its own name", () => {
    // The names are the documented way to point the action at a tool that is
    // not where it is looked for. Matching "printenv" alone would pass even
    // if every variable were read under the wrong name, or none at all.
    const expected = {
        vips: "IMAGE_FILES_TO_PDF_VIPS",
        vipsheader: "IMAGE_FILES_TO_PDF_VIPSHEADER",
        pdfcpu: "IMAGE_FILES_TO_PDF_PDFCPU"
    };

    for (const name of TOOL_NAMES) {
        const app = createFakeApp([["printenv", `/custom/${name}\n`]]);

        assert.equal(findTool(app, name), `/custom/${name}`);

        const asked = app.commands.find((command) => command.includes("printenv"));

        assert.match(asked, new RegExp(`'${expected[name]}'`, "u"));
    }
});

test("the PATH search covers both Homebrew prefixes and MacPorts", () => {
    // Apple Silicon installs under /opt/homebrew, Intel under /usr/local. A
    // search path missing either finds nothing on half the machines.
    const app = createFakeApp([
        ["printenv", failing("1")],
        ["'/opt/homebrew/bin/vips'", failing("1")],
        ["'/usr/local/bin/vips'", failing("1")],
        ["'/opt/local/bin/vips'", failing("1")],
        ["command -v", "/elsewhere/vips\n"]
    ]);

    findTool(app, "vips");

    const search = app.commands.find((command) => command.includes("command -v"));

    assert.match(
        search,
        /PATH='\/opt\/homebrew\/bin:\/usr\/local\/bin:\/opt\/local\/bin:\/usr\/bin:\/bin:\/usr\/sbin:\/sbin'/u
    );
    assert.match(search, /command -v 'vips'/u);
});

test("the direct candidates cover the same three package prefixes", () => {
    // Probed before the PATH search, so a tool present but not on PATH is
    // still found.
    const app = createFakeApp([["printenv", failing("1")], ["", failing("1")]]);

    findTool(app, "pdfcpu");

    const probed = app.commands
        .filter((command) => command.includes("'-x'"))
        .map((command) => command.match(/'(?<path>\/[^']*pdfcpu)'/u)?.groups.path);

    assert.deepEqual(probed.slice(0, 3), [
        "/opt/homebrew/bin/pdfcpu",
        "/usr/local/bin/pdfcpu",
        "/opt/local/bin/pdfcpu"
    ]);
});
