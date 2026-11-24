"use strict";
const { Buffer } = require("node:buffer");
const { stdout, stderr } = require("node:process");
const { reportText } = require("../core/run-report.js");

const SETUP_FAILED = 3;
const INVALID_REQUEST = 2;

function exitCode(result) {
    if (result.state === "canceled") { return 1; }
    if (result.issues.some((issue) => issue.stage === "setup")) { return SETUP_FAILED; }
    if (result.state === "invalid") { return INVALID_REQUEST; }
    return result.state === "complete" ? 0 : 1;
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
