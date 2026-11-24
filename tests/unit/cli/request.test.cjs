"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { cliCommand, jsonConfiguration, configurationValues, usage } = require("../../../src/cli/request.js");
const { DEFAULT_SETTINGS } = require("../../../src/core/settings.js");
const settings = { ...DEFAULT_SETTINGS };

test("CLI grammar rejects missing separators and distinguishes standalone informational commands", () => {
    assert.equal(cliCommand(["--help"]).kind, "help");
    assert.equal(cliCommand(["--version"]).kind, "version");
    for (const args of [[], ["--bogus"], ["--settings"], ["--help", "extra"], ["--settings", "x", "photo.jpg"], ["--settings", "x", "--"], ["--settings", "", "--", "photo"]]) {
        assert.throws(() => cliCommand(args), (error) => error.issues[0].code === "usage" && error.message.includes("Run with --help"));
    }
});

test("settings use fatal UTF-8 and local file URLs, and source operands stay literal", () => {
    using folder = fs.mkdtempDisposableSync(path.join(os.tmpdir(), "iftp-req-"));
    const file = path.join(folder.path, "settings é.json");
    const url = pathToFileURL(file).href;
    fs.writeFileSync(file, JSON.stringify(settings));
    const request = cliCommand(["--settings", url, "--", "-é.jpg", "--"]);
    assert.deepEqual(request.invocation, { settings, timestamp: "", inputItems: ["-é.jpg", "--"] });
    fs.writeFileSync(file, "\uFEFF{}");
    assert.throws(() => cliCommand(["--settings", file, "--", "x"]), /byte-order mark/u);
    for (const refused of ["file://host/config.json", "file:///bad%00.json", "file:///bad%.json"]) {
        assert.throws(() => cliCommand(["--settings", refused, "--", "x"]), (error) => error.issues[0].code === "settings-file");
    }
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



test("supplied timestamp is optional only by absence",()=>{
    for(const timestamp of [null,false,0,"",[],{},"2026/10/29"]) {
        assert.throws(()=>configurationValues({...DEFAULT_SETTINGS,timestamp}),(error)=>error.issues.some((issue)=>issue.field==="timestamp"));
    }
    assert.equal(configurationValues({...DEFAULT_SETTINGS,timestamp:"20240229_010203"}).timestamp,"20240229_010203");
});

test("the Node floor compares the release tuple", () => {
    const { supportedNode } = require("../../../src/engine/runtime.js");
    for (const version of ["26.13.1", "26.13.2", "26.14.0", "27.0.0"]) { assert.ok(supportedNode(version)); }
    for (const version of ["25.15.1", "26.0.0", "26.13.0"]) { assert.equal(supportedNode(version), false); }
});

test("Windows path grammar distinguishes ordinary names from ambiguous namespaces", () => {
    const { ordinaryWindowsPath } = require("../../../src/engine/paths.js");
    for (const name of ["C:\\Photos\\été.png", "D:/Folder/photo.jpg", "photos\\café.png", "..\\photo.png", "name with spaces.jpg"]) {
        assert.ok(ordinaryWindowsPath(name), name);
    }
    for (const name of ["C:photo.jpg", "\\rooted\\photo.jpg", "\\\\server\\folder\\photo.jpg", "\\\\?\\C:\\photo.png",
        "C:/folder/photo.png:stream", "C:/NUL.png", "C:/COM¹.jpg", "trailing space .png ", "trailing-dot."]) {
        assert.equal(ordinaryWindowsPath(name), false, name);
    }
});
