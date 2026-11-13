"use strict";
const { failedRun } = require("../../core/outcomes.js");
const { hostError } = require("../cancellation.js");
const { execute, application } = require("../main.js");
const { cliCommand, showCliCommand } = require("./cli.js");
const { reportHeadless } = require("./reporting.js");
const { commandLineInteraction } = require("./interaction.js");

function cliRequest(input) {
    try { return cliCommand(input); }
    catch (error) { return { kind: "failed", outcome: failedRun(error) }; }
}

function cliOutcome(invocation) {
    const interaction = commandLineInteraction(invocation);
    try {
        try { return execute(application(), invocation, { interaction }); }
        finally { interaction.progress.close(); }
    } catch (caught) { return failedRun(hostError(caught), caught?.outcome); }
}

function runCli(input) {
    const command = cliRequest(input);
    if (command.kind === "failed") { return reportHeadless(command.outcome); }
    return command.kind === "run" ? reportHeadless(cliOutcome(command.invocation)) : showCliCommand(command.kind);
}
module.exports = { runCli };
