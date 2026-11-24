"use strict";
const { Buffer } = require("node:buffer");
const { spawn } = require("node:child_process");
const { dirname } = require("node:path");
const { setTimeout, clearTimeout } = require("node:timers");
const { platform, env } = require("node:process");
const { MessageChannel, Worker, receiveMessageOnPort } = require("node:worker_threads");
const { OperationError, UserCanceled } = require("../core/errors.js");

const CHILD_LIMIT_MS = 900000;
const REPLY_LIMIT_MS = 930000;
const OUTPUT_LIMIT = 8388608;
const WINDOWS_UNITS = 32766;
const POSIX_BYTES = 122880;
const SIGNALS = platform === "win32" ? ["SIGINT"] : ["SIGINT", "SIGTERM"];
const REPLY = 0;
const STOP = 1;
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

function startWorker(file, invocation) {
    const { port1, port2 } = new MessageChannel();
    const shared = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * (STOP + 1));
    const state = new Int32Array(shared);
    const latchStop = () => Atomics.store(state, STOP, 1);
    let active = null;
    for (const signal of SIGNALS) { process.on(signal, latchStop); }
    const close = () => {
        port1.close();
        for (const signal of SIGNALS) { process.off(signal, latchStop); }
    };
    try {
        const worker = new Worker(file, { workerData: { port: port2, shared, invocation }, transferList: [port2] });
        let fault = null, outcome = null;
        const done = new Promise((resolve, reject) => {
            worker.on("message", (message) => {
                if (message.outcome) { ({ outcome } = message); return; }
                const { id, argv, options } = message;
                active = runChild(argv, options).catch((error) => ({ error: error.message })).then((result) => {
                    port1.postMessage({ id, result });
                    Atomics.store(state, REPLY, id);
                    Atomics.notify(state, REPLY);
                });
            });
            worker.on("error", (error) => { fault = error; });
            worker.on("exit", async (code) => {
                try {
                    await active;
                    if (fault || code !== 0 || !outcome) { throw fault ?? new Error("The conversion worker did not complete."); }
                    resolve(outcome);
                } catch (error) { reject(error); }
            });
        });
        return { close, done };
    } catch (error) {
        port2.close();
        close();
        throw error;
    }
}

function workerCommands(parentPort, { port, shared }) {
    const state = new Int32Array(shared);
    let next = 0;
    const stopped = () => Atomics.load(state, STOP) !== 0;
    return { stopped, fits, request(argv, options = {}) {
        if (!fits(argv)) { throw new OperationError("The command exceeds the argument budget."); }
        const previous = next;
        next += 1;
        parentPort.postMessage({ id: next, argv, options });
        if (Atomics.wait(state, REPLY, previous, REPLY_LIMIT_MS) === "timed-out") {
            throw new Error("The native process owner did not acknowledge settlement.");
        }
        const reply = receiveMessageOnPort(port)?.message;
        if (Atomics.load(state, REPLY) !== next || reply?.id !== next) { throw new Error("The native process reply could not be matched."); }
        return reply.result;
    }, checkpoint() { if (stopped()) { throw new UserCanceled(); } } };
}

function commandOutput(result, argv, label) {
    if (result.status === 0 && !result.error) { return result.stdout; }
    const message = result.error || result.stderr || result.stdout || String(result.signal ?? result.status);
    throw new OperationError(`Command failed while ${label}.\n\n${message.trim()}`, { command: JSON.stringify(argv) });
}

module.exports = { startWorker, workerCommands, commandOutput };
