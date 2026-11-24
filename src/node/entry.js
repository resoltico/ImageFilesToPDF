"use strict";
const { argv, versions, stdout } = require("node:process");
const { isMainThread, parentPort, workerData } = require("node:worker_threads");
const { failedRun } = require("../core/outcomes.js");
const { OperationError } = require("../core/errors.js");
const { issueMessage } = require("../core/messages.js");
const { report, write } = require("./transport.js");
const { cliCommand } = require("./request.js");
const { startWorker, workerCommands } = require("./processes.js");
const { convert } = require("./convert.js");

const { MINIMUM_NODE_VERSION, supportedNode } = require("./runtime.js");
const USER_ARGUMENTS = 2;

async function main() {
    let active = null;
    try {
        if (!supportedNode(versions.node)) {
            const issue = issueMessage("runtime-unsupported", "setup", "runtimeUnsupported", { minimum: MINIMUM_NODE_VERSION });
            throw new OperationError(issue.message, { issues: [issue] });
        }
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
    convert(workerData.invocation, workerCommands(parentPort, workerData))
        .then((outcome) => parentPort.postMessage({ outcome }), (error) => { throw error; });
}
