"use strict";
const { spawn } = require("node:child_process");
const { createInterface } = require("node:readline");
const { once } = require("node:events");
const process = require("node:process");
const { encodeHelperRequest, readHelperReply } = require("./platform/helper-codec.js");
const { setTimeout, clearTimeout } = require("node:timers");

const REQUEST_LIMIT_MS = 900000;
const OUTPUT_LIMIT = 8388608;

function helperSession(file, args, { detached, ascii = false }) {
    const child = spawn(file, args, { stdio: ["pipe", "pipe", "pipe"], detached, windowsHide: true });
    const output = createInterface({ input: child.stdout, crlfDelay: Infinity });
    const lines = output[Symbol.asyncIterator]();
    const closed = once(child, "close");
    const terminate = () => { if (child.exitCode === null) { child.kill("SIGKILL"); } };
    process.once("exit", terminate);
    closed.catch(() => undefined);
    child.stdin.on("error", () => undefined);
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (part) => {
        stderr += part;
        if (stderr.length > OUTPUT_LIMIT) { terminate(); }
    });

    async function answer(request) {
        try {
            child.stdin.write(`${encodeHelperRequest(request, ascii)}\n`);
            const { value, done } = await lines.next();
            if (done) { throw new Error(stderr.trim() || "The platform helper ended before answering."); }
            return readHelperReply(value);
        } catch (error) {
            terminate();
            await closed.catch(() => undefined);
            throw error;
        }
    }

    async function exchange(request) {
        const deadline = setTimeout(terminate, REQUEST_LIMIT_MS);
        try { return await answer(request); }
        finally { clearTimeout(deadline); }
    }

    let tail = Promise.resolve();
    return {
        request(request) {
            const response = tail.then(() => exchange(request));
            tail = response.catch(() => undefined);
            return response;
        },
        async close() {
            try {
                await tail;
                child.stdin.end();
                await closed;
            } finally {
                process.off("exit", terminate);
                output.close();
            }
        }
    };
}

module.exports = { helperSession };
