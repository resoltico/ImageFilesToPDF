"use strict";
const process = require("node:process");
const { isMainThread, parentPort, workerData } = require("node:worker_threads");
const { convert } = require("../node/convert.js");
const { workerCommands } = require("../node/processes.js");
const { workerSession } = require("./worker-session.js");
const { serve } = require("./serve.js");

const FINDER_TOOL_DIRECTORIES = [
    "/opt/homebrew/bin", "/usr/local/bin", "/opt/local/bin", "/usr/bin", "/bin", "/usr/sbin", "/sbin"
];

async function runWorker() {
    const commands = workerCommands(parentPort, workerData);
    try {
        const session = workerSession(parentPort, commands.stopped);
        parentPort.postMessage({ outcome: await convert(workerData.invocation, commands, {
            session, directories: FINDER_TOOL_DIRECTORIES
        }) });
    } finally { parentPort.close(); }
}

if (isMainThread) {
    if (process.argv.at(-1) === "--serve") { serve().then((status) => { process.exitCode = status; }, () => { process.exitCode = 1; }); }
    else { process.exitCode = 2; }
} else {
    runWorker().catch((error) => { throw error; });
}
