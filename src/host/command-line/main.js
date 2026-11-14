"use strict";
const { createProgress } = require("../progress.js");
const signalController = require("./signal-controller.js");
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

function cliOutcome(invocation, progress, startMonitor) {
    try {
        try {
            const interaction = commandLineInteraction(invocation, { progress });
            startMonitor();
            return execute(application(), invocation, { interaction });
        } finally { progress.close(); }
    } catch (caught) {
        const failed = failedRun(hostError(caught), caught?.outcome);
        if (!caught?.outcome) { failed.diagnostics.push(...progress.diagnostics); }
        return failed;
    }
}

function closeMonitor(monitor, failed) {
    try { monitor?.close(); }
    catch (error) { if (!failed) { throw error; } }
}

function monitoredRun(invocation) {
    let monitor = null;
    const progress = createProgress([{
        start: () => undefined, pause: () => undefined, close: () => undefined,
        report() { if (monitor?.poll()) { progress.requestStop(); } }
    }]);
    let failed = false;
    try {
        return reportHeadless(cliOutcome(invocation, progress, () => { monitor = signalController.createSignalController(); }));
    } catch (error) { failed = true; throw error; }
    finally { closeMonitor(monitor, failed); }
}

function runCli(input) {
    const command = cliRequest(input);
    if (command.kind === "failed") { return reportHeadless(command.outcome); }
    return command.kind === "run" ? monitoredRun(command.invocation) : showCliCommand(command.kind);
}
module.exports = { runCli };
