"use strict";

/*
 * The command line as people run it: a Node process with real streams, real
 * settings files and a real exit status.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { spawn } = require("node:child_process");
const { message } = require("../../../src/core/messages.js");

const CLI = path.resolve(__dirname, "../../../src/cli/entry.js");
const PRELOAD = path.resolve(__dirname, "../faults/preload.cjs");
// The command line names paths with forward slashes on every platform.
const shown = (file) => file.replaceAll("\\", "/");

function run(args, { fault, closeOutput = false } = {}) {
    const child = spawn(process.execPath, [...(fault ? ["--require", PRELOAD] : []), CLI, ...args], {
        stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, ...(fault ? { IFTP_TEST_FAULT: fault } : {}) }
    });
    let stdout = "";
    let stderr = "";
    if (closeOutput) { child.stdout.destroy(); } else { child.stdout.on("data", (chunk) => { stdout += chunk; }); }
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    return new Promise((resolve) => { child.on("close", (status) => resolve({ status, stdout, stderr })); });
}

function settingsFile(context, content) {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), "iftp-cli-"));
    context.after(() => fs.rmSync(folder, { recursive: true, force: true }));
    const file = path.join(folder, "settings.json");
    if (content !== undefined) { fs.writeFileSync(file, content); }
    return { folder, file };
}

async function refusal(args, options) {
    const result = await run(args, options);
    assert.equal(result.status, 2, result.stderr);
    return JSON.parse(result.stdout).issues[0];
}

test("help that cannot be written ends with a failure status", async () => {
    assert.equal((await run(["--help"], { closeOutput: true })).status, 1);
    assert.equal((await run(["--version"])).status, 0);
});

test("a settings file is refused for each way it can be wrong", async (context) => {
    for (const [content, id] of [["[1,", "settingsFileInvalidJson"], ["\uFEFF{}", "settingsFileBom"]]) {
        const { file } = settingsFile(context, content);
        const issue = await refusal(["--settings", file, "--", "a.png"]);
        assert.equal(issue.code, "settings-file");
        assert.equal(issue.message, message(id, { path: shown(file) }), content);
    }
    const { file: missing } = settingsFile(context);
    assert.equal((await refusal(["--settings", missing, "--", "a.png"])).message, message("settingsFileMissing", { path: shown(missing) }));
});

test("a settings file that cannot be read is called unreadable", { skip: process.platform === "win32" || process.getuid?.() === 0 }, async (context) => {
    const { file } = settingsFile(context, "{}");
    fs.chmodSync(file, 0o000);
    assert.equal((await refusal(["--settings", file, "--", "a.png"])).message, message("settingsFileUnreadable", { path: shown(file) }));
});

test("a settings file replaced between its check and its opening is refused", async (context) => {
    const { file } = settingsFile(context, "{}");
    const issue = await refusal(["--settings", file, "--", "a.png"], { fault: "settings-replaced" });
    assert.equal(issue.message, message("settingsFileNotRegular", { path: shown(file) }));
});

test("a fault before the command starts still ends with a failure status", async () => {
    const result = await run(["--version"], { fault: "signal-handlers" });
    assert.equal(result.status, 1);
});
