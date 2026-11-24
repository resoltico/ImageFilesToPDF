"use strict";
const { argv, versions, stdout } = require("node:process");
const { failedRun } = require("../core/outcomes.js");
const { OperationError } = require("../core/errors.js");
const { issueMessage } = require("../core/messages.js");
const { report, write } = require("./transport.js");
const { cliCommand } = require("./request.js");
const { commandSession } = require("../engine/processes.js");
const { convert } = require("../engine/convert.js");

const { MINIMUM_NODE_VERSION, supportedNode } = require("../engine/runtime.js");
const USER_ARGUMENTS = 2;

async function main() {
    const commands = commandSession();
    try {
        if (!supportedNode(versions.node)) {
            const issue = issueMessage("runtime-unsupported", "setup", "runtimeUnsupported", { minimum: MINIMUM_NODE_VERSION });
            throw new OperationError(issue.message, { issues: [issue] });
        }
        const command = cliCommand(argv.slice(USER_ARGUMENTS));
        if (command.kind !== "run") { return await write(stdout, command.text) ? 0 : 1; }
        return await report(await convert(command.invocation, commands));
    } catch (error) { return await report(failedRun(error)); }
    finally { commands.close(); }
}

main().then((code) => { process.exitCode = code; }, () => { process.exitCode = 1; });
