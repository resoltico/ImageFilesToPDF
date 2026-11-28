"use strict";
const { argv, stdout } = require("node:process");
const { failedRun } = require("../core/outcomes.js");
const { report, write } = require("./transport.js");
const { cliCommand } = require("./request.js");
const { commandSession } = require("../engine/processes.js");
const { convert } = require("../engine/convert.js");

const USER_ARGUMENTS = 2;

async function respond(commands) {
    try {
        const command = cliCommand(argv.slice(USER_ARGUMENTS));
        if (command.kind !== "run") { return await write(stdout, command.text) ? 0 : 1; }
        return await report(await convert(command.invocation, commands));
    } catch (error) { return await report(failedRun(error)); }
}

async function main() {
    const commands = commandSession();
    try { return await respond(commands); }
    finally { commands.close(); }
}

main().then((code) => { process.exitCode = code; }, () => { process.exitCode = 1; });
