"use strict";
const { stdin, stdout, stderr, versions } = require("node:process");
const { createInterface } = require("node:readline");
const { VERSION } = require("../core/version.js");
const { validateMessage } = require("../core/protocol.js");
const { UserCanceled } = require("../core/errors.js");
const { failedRun } = require("../core/outcomes.js");
const { startWorker } = require("../node/processes.js");

function lineWriter(output) {
    output.on("error", () => undefined);
    let tail = Promise.resolve(true);
    return (event) => {
        const line = `${JSON.stringify(validateMessage("engine", event), (key, value) => key === "stack" ? undefined : value)}\n`;
        tail = tail.then((success) => success && new Promise((resolve) => {
            output.write(line, "utf8", (error) => resolve(!error));
        }));
        return tail;
    };
}

function fromLine(line) {
    return validateMessage("client", JSON.parse(line));
}

function stop(active) {
    active.requestStop();
    active.send({ type: "stop" });
}

async function relayClient(active, messages) {
    try {
        for await (const line of messages) {
            const answer = fromLine(line);
            if (answer.type === "start") { throw new Error("The engine session has already started."); }
            if (answer.type === "stop") { active.requestStop(); }
            active.send(answer);
        }
    } finally { stop(active); }
}

async function runConversion({ inputItems }, read, send) {
    const active = startWorker(__filename, { inputItems }, { interactive: true, event: send });
    let fault = null;
    const incoming = relayClient(active, read).catch((error) => { fault = error; });
    try {
        const receipt = await active.done;
        if (fault) { throw fault; }
        return receipt;
    } finally {
        read.close();
        await incoming;
        active.close();
    }
}

async function serve() {
    const send = lineWriter(stdout);
    const read = createInterface({ input: stdin, crlfDelay: Infinity });
    const messages = read[Symbol.asyncIterator]();
    try {
        if (!await send({ type: "hello", version: VERSION, runtime: versions.node })) { return 1; }
        const first = await messages.next();
        const request = first.done ? null : fromLine(first.value);
        if (request && request.type !== "start") { throw new Error("An engine session starts with a selection."); }
        let receipt = null;
        if (request) {
            // Continue from the same iterator so queued lines stay in order.
            const rest = { [Symbol.asyncIterator]: () => messages, close: () => read.close() };
            receipt = await runConversion(request, rest, send);
        } else { receipt = failedRun(new UserCanceled()); }
        return await send({ type: "outcome", receipt }) ? 0 : 1;
    } catch (error) {
        stderr.write(`${error.message}\n`);
        return 1;
    } finally {
        read.close();
        stdin.pause();
    }
}

module.exports = { serve };
