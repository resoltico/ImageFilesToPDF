"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { cliCommand, jsonConfiguration, configurationValues, usage } = require("../../../src/host/command-line/cli.js");
const settings = { paperSize: "A4", orientation: "Portrait", mode: "combined", resolutionLimit: 72, quality: 92, background: "#FFFFFF" };
function io(configuration = settings) { return { absolute: (path) => path.startsWith("/") ? path : `/cwd/${path}`, read: () => configuration }; }

test("CLI grammar rejects incomplete/unknown commands without any I/O", () => {
    for (const args of [[], ["--"], ["--headles"], ["--help", "extra"], ["--headless"], ["--headless", "config"], ["--headless", "", "image"]]) {
        assert.throws(() => cliCommand(args, { read() { throw new Error("must not read"); } }), /Usage:/u);
    }
    assert.deepEqual(cliCommand(["--help"]), { kind: "help" });
    assert.deepEqual(cliCommand(["--version"]), { kind: "version" });
});

test("a usage error states the one problem and the run line, never the whole help", () => {
    const run = "Usage: osascript -l JavaScript Image-Files-to-PDF.jxa -- --headless <settings.json> <path…>\nRun with --help to see the settings.";
    for (const [args, problem] of [
        [[], "No arguments were given."], [["--"], "No arguments were given."],
        [["--headles", "a", "b"], "Unknown option: --headles."], [["image.png"], "Unknown option: image.png."],
        [["--headless"], "--headless needs a settings file and at least one path."],
        [["--headless", "config"], "--headless needs a settings file and at least one path."],
        [["--headless", "", "image"], "An argument is empty."], [[""], "An argument is empty."],
        [["--help", "extra"], "--help and --version take no other arguments."], [["--version", "--help"], "--help and --version take no other arguments."]
    ]) {
        assert.throws(() => cliCommand(args, { read() { throw new Error("must not read"); } }), (error) => {
            assert.deepEqual(error.issues, [{ code: "usage", stage: "request", message: `${problem}\n${run}` }], args.join(" "));
            return true;
        });
    }
});

test("CLI request uses one settings read and resolves every operand through its path port", () => {
    const reads = [];
    const port = io({ ...settings, timestamp: "20260904_010203" });
    port.read = (path) => { reads.push(path); return { ...settings, timestamp: "20260904_010203" }; };
    const command = cliCommand(["--", "--headless", "config.json", "image.png", "/a/2.png"], port);
    assert.deepEqual(reads, ["/cwd/config.json"]);
    assert.equal(command.kind, "run");
    assert.equal(Object.hasOwn(command.invocation, "headless"), false);
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

test("help renders canonical names, choice captions, bounds and complete JSON", () => {
    const text = usage();
    assert.match(text, /Settings \(all 6 required\):/u);
    for (const expected of ["PDF files", "combined", "One PDF — one image per page", "Paper size", "US Letter", "Maximum resolution", "72–1017", "Page background", "JPEG quality", "White"]) { assert.ok(text.includes(expected), expected); }
});

test("help states each numeric range once and documents the optional timestamp", () => {
    const text = usage();
    assert.match(text, /resolutionLimit — Maximum resolution: 72–1017 ppi\n/u);
    assert.match(text, /quality — JPEG quality: 1–100; JPEG re-encoding only\n/u);
    assert.equal(text.split("72–1017").length, 2, "the resolution range appears once");
    assert.match(text, /timestamp — YYYYMMDD_HHMMSS in local time; default now/u);
});

test("required settings help contains a ready-to-copy complete JSON example", () => {
    const text = usage();
    const example = /Example settings JSON \(all required fields\):\n(?<json>\{[\s\S]*?\n\})/u.exec(text);
    assert.ok(example);
    assert.deepEqual(JSON.parse(example.groups.json), { mode: "combined", paperSize: "A4", orientation: "Portrait", resolutionLimit: 300, quality: 82, background: "#FFFFFF" });
    assert.doesNotMatch(text, /(?:resolutionLimit|quality|background) — [^\n]*default/u);
});
