"use strict";

/*
 * Native commands as the engine runs them: real child processes, with their
 * output limit, their failures and a deadline. Only the clock is a stand-in,
 * because the deadline is fifteen minutes.
 */

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { commandSession, commandOutput } = require("../../../src/engine/processes.js");
const { message } = require("../../../src/core/messages.js");

const node = (script) => [process.execPath, "-e", script];

test("a command that writes more than the output limit is stopped and says why", async () => {
    const commands = commandSession();
    try {
        const result = await commands.request(node("const b = Buffer.alloc(1 << 20, 97); for (let i = 0; i < 10; i += 1) { process.stdout.write(b); } setInterval(() => {}, 1000);"));
        assert.equal(result.error, "The native command exceeded its output limit.");
        assert.equal(result.signal, "SIGKILL");
    } finally { commands.close(); }
});

test("a command that cannot start reports the system's reason", async () => {
    const commands = commandSession();
    try {
        const result = await commands.request([path.join(path.dirname(process.execPath), "no-such-command")]);
        assert.match(result.error, /ENOENT/u);
    } finally { commands.close(); }
});

// The module reads the clock when it loads, so it is loaded again under the stand-in.
function freshProcesses() {
    const file = require.resolve("../../../src/engine/processes.js");
    delete require.cache[file];
    return require("../../../src/engine/processes.js");
}

test("a command that runs past its deadline is stopped", async (context) => {
    context.mock.timers.enable({ apis: ["setTimeout"] });
    const commands = freshProcesses().commandSession();
    try {
        const pending = commands.request(node("setInterval(() => {}, 1000);"));
        context.mock.timers.tick(900000);
        const result = await pending;
        assert.equal(result.error, "The native command timed out.");
    } finally { commands.close(); }
});

test("an argument list past the system's budget is refused before anything runs", () => {
    const commands = commandSession();
    try {
        assert.throws(() => commands.request([process.execPath, "x".repeat(200000)]),
            (error) => error.message === message("commandArgumentBudgetExceeded"));
    } finally { commands.close(); }
});

test("Ctrl+C stops at the next checkpoint, and the handler goes with the session", () => {
    const before = process.listenerCount("SIGINT");
    const commands = commandSession();
    process.emit("SIGINT");
    assert.equal(commands.stopped(), true);
    assert.throws(() => commands.checkpoint(), { name: "UserCanceled" });
    commands.close();
    assert.equal(process.listenerCount("SIGINT"), before);
});

test("a failed command is described by what it said, or else by how it ended", async () => {
    const commands = commandSession();
    try {
        const argv = node("process.exit(3)");
        for (const [script, detail] of [
            ["process.stderr.write(' spoke '); process.exit(1)", "spoke"],
            ["process.stdout.write('only out'); process.exit(1)", "only out"],
            ["process.exit(3)", "3"],
            ["process.kill(process.pid, 'SIGKILL')", process.platform === "win32" ? "1" : "SIGKILL"]
        ]) {
            const result = await commands.request(node(script));
            assert.throws(() => commandOutput(result, argv, "testing"), (error) => error.diagnostic.message === detail, script);
        }
        assert.equal(commandOutput(await commands.request(node("process.stdout.write('ok')")), argv, "testing"), "ok");
    } finally { commands.close(); }
});
