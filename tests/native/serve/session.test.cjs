"use strict";

/*
 * The serve engine as the Finder action runs it: a Node child speaking JSON
 * lines on its standard streams, converting real images with the real tools.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { Buffer } = require("node:buffer");
const { spawn, execFileSync } = require("node:child_process");
const { setTimeout } = require("node:timers");
const { createInterface } = require("node:readline");
const { DEFAULT_SETTINGS } = require("../../../src/core/settings.js");

const ENGINE = path.resolve(__dirname, "../../../src/serve/entry.js");

/*
 * A Finder request names the tools it chose, or else the engine searches where
 * the Finder does, which is macOS's own path files. Elsewhere the tests name
 * the tools found on PATH.
 */
function toolPaths() {
    if (process.platform === "darwin") { return {}; }
    const suffix = process.platform === "win32" ? ".exe" : "";
    const search = Object.entries(process.env).find(([key]) => key.toUpperCase() === "PATH")[1].split(path.delimiter);
    return Object.fromEntries(["vips", "vipsheader", "pdfcpu"].map((name) =>
        [name, search.map((directory) => path.join(directory, `${name}${suffix}`)).find((file) => fs.existsSync(file))]));
}
const PRELOAD = path.resolve(__dirname, "../faults/preload.cjs");

function workArea(context) {
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), "iftp-serve-"));
    context.after(() => fs.rmSync(folder, { recursive: true, force: true }));
    const image = path.join(folder, "photo.png");
    execFileSync("vips", ["black", image, "16", "12", "--bands", "3"], { stdio: "pipe" });
    return { folder, image };
}

/*
 * Runs the engine with these arguments. `answer` is given each engine message
 * and returns the lines to send back, or null to close standard input.
 */
function session(args, opening, answer = () => []) {
    const child = spawn(process.execPath, [ENGINE, ...args], { stdio: ["pipe", "pipe", "pipe"] });
    const received = [];
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.stdin.on("error", () => undefined);
    // null, alone or last in a list, closes standard input.
    const send = (lines) => {
        for (const line of lines ?? [null]) {
            if (line === null) { child.stdin.end(); return; }
            child.stdin.write(Buffer.isBuffer(line) || typeof line === "string" ? line : `${JSON.stringify(line)}\n`);
        }
    };
    createInterface({ input: child.stdout }).on("line", (line) => {
        const event = JSON.parse(line);
        received.push(event);
        send(answer(event));
    });
    send(opening);
    return new Promise((resolve) => { child.on("close", (status) => resolve({ status, received, stderr })); });
}

test("a conversation asks for settings and ends with the receipt of a saved PDF", async (context) => {
    const { folder, image } = workArea(context);
    const result = await session(["--serve"], [{ type: "start", inputItems: [image], toolPaths: toolPaths() }], (event) => {
        if (event.type === "settings-needed") { return [{ type: "settings", values: { ...DEFAULT_SETTINGS, quality: 500 } }]; }
        if (event.type === "settings-invalid") { return [{ type: "settings", values: DEFAULT_SETTINGS }]; }
        return event.type === "outcome" ? null : [];
    });
    assert.equal(result.status, 0, result.stderr);
    const types = result.received.map(({ type }) => type);
    assert.equal(types[0], "hello");
    assert.ok(types.includes("settings-invalid"), "an invalid answer is asked again");
    const outcome = result.received.at(-1);
    assert.equal(outcome.type, "outcome");
    assert.equal(outcome.receipt.state, "complete");
    const [document] = outcome.receipt.documents;
    assert.ok(fs.existsSync(document.output), JSON.stringify(document));
    assert.equal(path.dirname(fs.realpathSync(document.output)), fs.realpathSync(folder), "saved beside the image");
});

test("a client that leaves before starting gets a canceled receipt", async () => {
    const result = await session(["--serve"], null);
    assert.equal(result.status, 0);
    assert.deepEqual(result.received.map(({ type }) => type), ["hello", "outcome"]);
    assert.equal(result.received[1].receipt.state, "canceled");
});

test("Stop during the run ends it with what was done", async (context) => {
    const { image } = workArea(context);
    const result = await session(["--serve"], [{ type: "start", inputItems: [image], toolPaths: toolPaths() }], (event) => {
        if (event.type === "settings-needed") { return [{ type: "stop" }]; }
        return event.type === "outcome" ? null : [];
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.received.at(-1).receipt.state, "canceled");
});

test("a request that is not a start, or not UTF-8, is refused on standard error", async () => {
    const wrong = await session(["--serve"], [{ type: "continue" }]);
    assert.equal(wrong.status, 1);
    assert.match(wrong.stderr, /\S/u);
    const garbled = await session(["--serve"], [Buffer.from([0xff, 0x0a])]);
    assert.equal(garbled.status, 1);
    // A character cut off by the end of input.
    const truncated = await session(["--serve"], [Buffer.from([0xe2, 0x82]), null]);
    assert.equal(truncated.status, 1);
});

test("a message out of turn during the run is reported in the receipt", async (context) => {
    const { image } = workArea(context);
    const result = await session(["--serve"], [{ type: "start", inputItems: [image], toolPaths: toolPaths() }], (event) => {
        if (event.type === "settings-needed") { return [{ type: "start", inputItems: [], toolPaths: {} }]; }
        return event.type === "outcome" ? null : [];
    });
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.received.at(-1).receipt.issues.some((issue) => issue.code === "protocol"));
});

test("without --serve the engine does nothing and says so by its status", async () => {
    const result = await session([], null);
    assert.equal(result.status, 2);
    assert.deepEqual(result.received, []);
});

test("an engine whose client stops reading mid-run, or before the receipt, ends with a failure status", async (context) => {
    const { image } = workArea(context);
    // Before the question about settings is sent, after it, and before the receipt.
    for (const at of ["hello", "settings-needed", "phase"]) {
        const child = spawn(process.execPath, [ENGINE, "--serve"], { stdio: ["pipe", "pipe", "pipe"] });
        child.stdin.on("error", () => undefined);
        const lines = createInterface({ input: child.stdout });
        lines.on("line", (line) => {
            const event = JSON.parse(line);
            if (event.type === "settings-needed" && at === "phase") { child.stdin.write(`${JSON.stringify({ type: "settings", values: DEFAULT_SETTINGS })}\n`); }
            if (event.type !== at) { return; }
            lines.close();
            child.stdout.destroy();
            // Left open, input would hold the engine; it is ended once the engine has
            // had time to find that nobody reads the question it asks.
            if (at === "hello") { setTimeout(() => child.stdin.end(), 2000); } else { child.stdin.end(); }
        });
        child.stdin.write(`${JSON.stringify({ type: "start", inputItems: [image], toolPaths: toolPaths() })}\n`);
        assert.equal(await new Promise((resolve) => { child.on("close", resolve); }), 1, at);
    }
});

test("an engine whose output is closed stops at once", async () => {
    const child = spawn(process.execPath, [ENGINE, "--serve"], { stdio: ["pipe", "pipe", "pipe"] });
    child.stdout.destroy();
    const status = await new Promise((resolve) => { child.on("close", resolve); });
    assert.notEqual(status, 0);
});

test("an engine that cannot read its input at all ends with a failure status", async () => {
    const child = spawn(process.execPath, ["--require", PRELOAD, ENGINE, "--serve"], {
        stdio: ["pipe", "pipe", "pipe"], env: { ...process.env, IFTP_TEST_FAULT: "stdin-unreadable" }
    });
    child.stdout.resume();
    assert.equal(await new Promise((resolve) => { child.on("close", resolve); }), 1);
});
