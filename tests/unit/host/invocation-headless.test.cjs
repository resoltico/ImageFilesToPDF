"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { cliCommand, jsonConfiguration, configurationValues, usage } = require("../../../src/host/cli.js");
const settings = { paperSize: "A4", orientation: "Portrait", mode: "combined", resolutionLimit: 72, quality: 92, background: "#FFFFFF" };
function io(configuration = settings) { return { absolute: (path) => path.startsWith("/") ? path : `/cwd/${path}`, read: () => configuration }; }

test("CLI grammar rejects incomplete/unknown commands without any I/O", () => {
    for (const args of [[], ["--"], ["--headles"], ["--help", "extra"], ["--headless"], ["--headless", "config"], ["--headless", "", "image"]]) {
        assert.throws(() => cliCommand(args, { read() { throw new Error("must not read"); } }), /Usage:/u);
    }
    assert.deepEqual(cliCommand(["--help"]), { kind: "help" });
    assert.deepEqual(cliCommand(["--version"]), { kind: "version" });
});

test("CLI request uses one settings read and resolves every operand through its path port", () => {
    const reads = [];
    const port = io({ ...settings, timestamp: "20260904_010203" });
    port.read = (path) => { reads.push(path); return { ...settings, timestamp: "20260904_010203" }; };
    const command = cliCommand(["--", "--headless", "config.json", "image.png", "/a/2.png"], port);
    assert.deepEqual(reads, ["/cwd/config.json"]);
    assert.equal(command.kind, "run");
    assert.equal(command.invocation.headless, true);
    assert.deepEqual(command.invocation.settings, settings);
    assert.equal(command.invocation.timestamp, "20260904_010203");
    assert.deepEqual(command.invocation.inputItems, ["/cwd/image.png", "/a/2.png"]);
    assert.equal(cliCommand(["--headless", "config", "image"], io()).invocation.timestamp, "");
});

test("configuration validation retains all field issues and timestamp presence", () => {
    for (const timestamp of [null, false, "", "2026/09/12", "../../elsewhere"]) {
        assert.throws(() => configurationValues({ ...settings, timestamp }), (error) => error.issues.some((issue) => issue.field === "timestamp" && issue.stage === "request"));
    }
    assert.throws(() => configurationValues({ resolutionLimit: 1, timestamp: false }), (error) => error.issues.length === 7);
});

test("JSON diagnostics name the settings path and distinguish root type from syntax", () => {
    for (const text of ["null", "false", "0", '"text"', "[]"]) { assert.throws(() => jsonConfiguration(text, "/config.json"), /not an object: \/config\.json/u); }
    assert.throws(() => jsonConfiguration("{", "/config.json"), /not valid JSON.*\/config\.json/u);
    assert.deepEqual(jsonConfiguration('{"value":1,"value":2}', "/config.json"), { value: 2 });
});

test("help renders canonical names, choice captions, defaults and bounds", () => {
    const text = usage();
    for (const expected of ["PDF files", "combined", "One PDF — one image per page", "Paper size", "US Letter", "Maximum resolution", "72–1017", "Page background", "JPEG quality", "default 82", "White"]) { assert.ok(text.includes(expected), expected); }
});
