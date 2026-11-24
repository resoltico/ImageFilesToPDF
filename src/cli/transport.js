"use strict";
const { Buffer } = require("node:buffer");
const { stdout, stderr, platform } = require("node:process");
const { reportText } = require("../core/run-report.js");
const { exitCode } = require("./exit-code.js");
const { nativeWindowsPath } = require("./paths.js");

const PATH_FIELDS = new Set(["source", "path", "folder", "output", "recovery"]);
const displayPath = platform === "win32" ? nativeWindowsPath : (path) => path;

function write(stream, text) {
    return new Promise((resolve) => {
        // Node emits stream errors after the callback. Keep the listener for the invocation.
        stream.on("error", () => resolve(false));
        try { stream.write(Buffer.from(text, "utf8"), (error) => resolve(!error)); }
        catch { resolve(false); }
    });
}

function receiptText(result, renderPath = displayPath) {
    return `${JSON.stringify(result, (key, value) => {
        if (key === "stack") { return undefined; }
        if (key === "sources" && Array.isArray(value)) { return value.map(renderPath); }
        if (PATH_FIELDS.has(key) && typeof value === "string") { return renderPath(value); }
        return value;
    })}\n`;
}

async function report(result, output = stdout, errors = stderr) {
    const prose = await write(errors, `${reportText(result, true, displayPath)}\n`);
    const receipt = await write(output, receiptText(result));
    if (!receipt) { await write(errors, "Standard output could not be completed.\n"); }
    return prose && receipt ? exitCode(result) : 1;
}

module.exports = { receiptText, report, write };
