"use strict";
const { stdin, stdout, stderr, versions } = require("node:process");
const { VERSION } = require("../core/product.js");
const { decodeMessage } = require("../core/protocol.js");
const { UserCanceled } = require("../core/errors.js");
const { failedRun, runOutcome } = require("../core/outcomes.js");
const { commandSession } = require("../engine/processes.js");
const { convert } = require("../engine/convert.js");
const { dialogue } = require("./dialogue.js");
const { utf8Lines, lineWriter } = require("./stdio.js");
const { message, issueMessage } = require("../core/messages.js");
const { interactions } = require("./interactions.js");

async function relayClient(queue, messages) {
    try {
        for await (const line of messages) {
            const answer = decodeMessage("client", line);
            if (answer.type === "start") { throw new Error(message("engineMessageOrder")); }
            if (answer.type === "stop") { queue.stop(); }
            else { queue.receive(answer); }
        }
    } finally { queue.stop(); }
}

async function runConversion({ inputItems, toolPaths }, read, send, convertRun) {
    const commands = commandSession();
    const queue = dialogue(commands);
    let fault = null;
    const incoming = relayClient(queue, read).catch((error) => { fault = error; });
    try {
        const session = interactions(send, async (event) => {
            const reply = queue.expect(event.type);
            if (!await send(event)) { queue.stop(); }
            return reply;
        });
        const receipt = await convertRun({ inputItems }, commands, { session, toolPaths });
        if (!fault) { return receipt; }
        const issue = { ...issueMessage("protocol", "request", "engineRequestInvalid"), diagnostic: { message: fault.message } };
        return runOutcome(receipt.documents, receipt.rejected, [...receipt.issues, issue], receipt.diagnostics);
    } finally {
        read.close();
        await incoming;
        commands.close();
    }
}

async function exchange(send, read, errors, convertRun) {
    const { messages } = read;
    try {
        if (!await send({ type: "hello", version: VERSION, runtime: versions.node })) { return 1; }
        const first = await messages.next();
        const request = first.done ? null : decodeMessage("client", first.value);
        if (request && request.type !== "start") { throw new Error(message("engineMessageOrder")); }
        let receipt = null;
        if (request) {
            // Continue from the same iterator so queued lines stay in order.
            const rest = { [Symbol.asyncIterator]: () => messages, close: () => read.close() };
            receipt = await runConversion(request, rest, send, convertRun);
        } else { receipt = failedRun(new UserCanceled()); }
        return await send({ type: "outcome", receipt }) ? 0 : 1;
    } catch (error) {
        errors.write(`${error.message}\n`);
        return 1;
    }
}

async function serve({ input = stdin, output = stdout, errors = stderr, convertRun = convert } = {}) {
    const read = utf8Lines(input);
    try { return await exchange(lineWriter(output), read, errors, convertRun); }
    finally { read.close(); }
}

module.exports = { serve };
