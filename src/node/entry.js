"use strict";
const { argv, versions, stdout } = require("node:process");
const { isMainThread, parentPort, workerData } = require("node:worker_threads");
const { failedRun } = require("../core/outcomes.js");
const { report, write } = require("./transport.js");
const { cliCommand } = require("./request.js");
const { startWorker, workerCommands } = require("./processes.js");
const { convert } = require("./convert.js");

const { MINIMUM_NODE_VERSION, supportedNode } = require("./runtime.js");
const USER_ARGUMENTS = 2;

async function main() {
    let active = null;
    try {
        if (!supportedNode(versions.node)) { throw new Error(`Node.js ${MINIMUM_NODE_VERSION} or later is required.`); }
        const command = cliCommand(argv.slice(USER_ARGUMENTS));
        if (command.kind !== "run") { return await write(stdout, command.text) ? 0 : 1; }
        active = startWorker(__filename, command.invocation);
        return await report(await active.done);
    } catch (error) { return await report(failedRun(error)); }
    finally { active?.close(); }
}

if (isMainThread) {
    main().then((code) => { process.exitCode = code; }, () => { process.exitCode = 1; });
} else {
    parentPort.postMessage({ outcome: convert(workerData.invocation, workerCommands(parentPort, workerData)) });
}
