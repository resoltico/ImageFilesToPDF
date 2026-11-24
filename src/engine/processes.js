"use strict";
const { message: wording } = require("../core/messages.js");
const { Buffer } = require("node:buffer");
const { spawn } = require("node:child_process");
const { dirname } = require("node:path");
const { setTimeout, clearTimeout } = require("node:timers");
const { platform, env } = require("node:process");
const { OperationError, UserCanceled } = require("../core/errors.js");

const CHILD_LIMIT_MS = 900000;
const OUTPUT_LIMIT = 8388608;
const WINDOWS_UNITS = 32766;
const POSIX_BYTES = 122880;
const SIGNALS = platform === "win32" ? ["SIGINT"] : ["SIGINT", "SIGTERM"];
const WINDOWS_ESCAPE_FACTOR = 2;
const WINDOWS_ARGUMENT_PADDING = 3;

function fits(argv) {
    // Every Windows unit could need doubling under libuv's quoting rules.
    // Allow quotes, separators and the terminating NUL independently.
    if (platform === "win32") { return argv.reduce((sum, arg) => sum + WINDOWS_ESCAPE_FACTOR * arg.length + WINDOWS_ARGUMENT_PADDING, 0) <= WINDOWS_UNITS; }
    return argv.reduce((sum, arg) => sum + Buffer.byteLength(arg) + 1, 0) <= POSIX_BYTES;
}

function runChild(argv, options) {
    return new Promise((resolve) => {
        const [file, ...args] = argv;
        const child = spawn(file, args, {
            cwd: dirname(file), env: { ...env, LC_ALL: "C", TZ: "UTC", ...options.env },
            detached: options.detached ?? true, windowsHide: true, stdio: ["ignore", "pipe", "pipe"]
        });
        const stderr = [], stdout = [];
        let bytes = 0, error = "";
        function terminate(reason) {
            error ||= reason;
            child.kill("SIGKILL");
        }
        function collect(target, data) {
            bytes += data.length;
            if (bytes > OUTPUT_LIMIT) { if (!error) { terminate("The native command exceeded its output limit."); } }
            else { target.push(data); }
        }
        child.stdout.on("data", (data) => collect(stdout, data));
        child.stderr.on("data", (data) => collect(stderr, data));
        child.on("error", (cause) => { error ||= cause.message; });
        const deadline = setTimeout(() => terminate("The native command timed out."), CHILD_LIMIT_MS);
        child.once("close", (status, signal) => {
            clearTimeout(deadline);
            resolve({ status, signal, error, stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") });
        });
    });
}

function commandSession() {
    let stopping = false;
    function requestStop() { stopping = true; }
    for (const signal of SIGNALS) { process.on(signal, requestStop); }
    return {
        stopped: () => stopping,
        requestStop,
        fits,
        request(argv, options = {}) {
            if (!fits(argv)) { throw new OperationError(wording("commandArgumentBudgetExceeded")); }
            return runChild(argv, options);
        },
        checkpoint() { if (stopping) { throw new UserCanceled(); } },
        close() { for (const signal of SIGNALS) { process.off(signal, requestStop); } }
    };
}

function commandOutput(result, argv, label) {
    if (result.status === 0 && !result.error) { return result.stdout; }
    const detail = result.error || result.stderr || result.stdout || String(result.signal ?? result.status);
    throw new OperationError(wording("nativeCommandFailedForOperation", { label }), { command: JSON.stringify(argv), params: { label }, diagnostic: { message: detail.trim() } });
}

module.exports = { commandSession, commandOutput };
