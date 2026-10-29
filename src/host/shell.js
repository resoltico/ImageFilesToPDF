"use strict";
const { hostError } = require("./cancellation.js");

const { CAT, RM } = require("./backend-executables.js");
const { COMMAND_BUDGET_BYTES, commandLengthOf } = require("../backend/batching.js");
const { utf8Length } = require("../core/utf8.js");
const { shellJoin } = require("../backend/shell.js");
const { ISSUE, issuesOf } = require("../core/outcomes.js");
const { OperationError, errorMessage } = require("../core/errors.js");

/*
 * Running a command and taking what it printed.
 *
 * Every argument is quoted here. Header inspection additionally fixes only
 * the C locale so optional-field errors have a stable language.
 *
 * Asking the filesystem a question is a different thing and lives in
 * asking.js: a question that comes back "no" has answered, and must not be
 * dressed up as a command that failed.
 */

const HEADER_LOCALE_PREFIX = "LC_ALL=C ";
const HEADER_ARGV_BUDGET = COMMAND_BUDGET_BYTES - utf8Length(HEADER_LOCALE_PREFIX);

function runCommand(app, command, label) {
    try {
        return app.doShellScript(command);
    } catch (caught) {
        const error = hostError(caught);
        const context = label ? ` while ${label}` : "";

        const failure = new OperationError(
            `Command failed${context}.\n\n${errorMessage(error)}`,
            { cause: error }
        );

        // Carried alongside the message so the presenter can decide: shown in
        // a log, withheld from a dialog.
        failure.command = command;

        throw failure;
    }
}

function runArgv(app, argumentsList, label) { return runCommand(app, shellJoin(argumentsList), label); }

function runHeaderArgv(app, argumentsList, label) {
    if (commandLengthOf(argumentsList) > HEADER_ARGV_BUDGET) { throw new OperationError("The image header command exceeds the argument budget."); }
    return runCommand(app, `${HEADER_LOCALE_PREFIX}${shellJoin(argumentsList)}`, label);
}

/*
 * A command whose failure is an answer rather than an error: a temporary file
 * that will not go, a directory that will not empty, a measurement that
 * cannot be taken. Nothing is thrown and nothing is described -- a
 * description is written for somebody to read, and here there is nobody.
 * What silence means is the caller's to decide, and every caller of this has
 * an answer for it.
 */

function readTextFile(app, path) {
    return runArgv(app, [CAT, path], "reading headless configuration");
}

function cleanupArgv(app, argumentsList) {
    try { runArgv(app, argumentsList, "removing owned temporary work"); return { state: "removed" }; }
    catch (error) {
        const [issue] = issuesOf(error, "cleanup");
        return { state: "failed", issue: { ...issue, code: issue.code === ISSUE.operation ? ISSUE.cleanup : issue.code } };
    }
}

function removeFile(app, path) {
    return path ? cleanupArgv(app, [RM, "-f", path]) : { state: "removed" };
}

module.exports = { HEADER_ARGV_BUDGET, runHeaderArgv, runArgv, readTextFile, removeFile, cleanupArgv };
