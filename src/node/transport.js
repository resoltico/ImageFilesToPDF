"use strict";
const { Buffer } = require("node:buffer");
const { stdout, stderr } = require("node:process");
const { reportText } = require("../core/run-report.js");
const { RUN_OUTCOME } = require("../core/outcomes.js");

const INVALID_REQUEST = 2;
const SETUP_FAILED = 3;
const EXIT_CODES = new Map([
    [RUN_OUTCOME.complete, 0],
    [RUN_OUTCOME.incomplete, 1],
    [RUN_OUTCOME.canceled, 1],
    [RUN_OUTCOME.invalidRequest, INVALID_REQUEST],
    [RUN_OUTCOME.setupFailed, SETUP_FAILED]
]);

function exitCode(result) {
    const status = EXIT_CODES.get(result.state);
    if (status === undefined) { throw new Error(`Unknown run outcome: ${result.state}`); }
    return status;
}

function write(stream, text) {
    return new Promise((resolve) => {
        // Node emits stream errors after the callback. Keep the listener for the invocation.
        stream.on("error", () => resolve(false));
        try { stream.write(Buffer.from(text, "utf8"), (error) => resolve(!error)); }
        catch { resolve(false); }
    });
}

function receiptText(result) {
    return `${JSON.stringify(result, (key, value) => key === "stack" ? undefined : value)}\n`;
}

async function report(result, output = stdout, errors = stderr) {
    const prose = await write(errors, `${reportText(result)}\n`);
    const receipt = await write(output, receiptText(result));
    if (!receipt) { await write(errors, "Standard output could not be completed.\n"); }
    return prose && receipt ? exitCode(result) : 1;
}

module.exports = { exitCode, receiptText, report, write };
