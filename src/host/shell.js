"use strict";
const { hostError } = require("./cancellation.js");

const { RM, RMDIR, MKTEMP } = require("./backend-executables.js");
const { COMMAND_BUDGET_BYTES, commandLengthOf } = require("../backend/batching.js");
const { utf8Length } = require("../core/utf8.js");
const { shellJoin, shellQuote } = require("../backend/shell.js");
const { ISSUE, issuesOf } = require("../core/outcomes.js");
const { OperationError, errorMessage } = require("../core/errors.js");

/*
 * Running a command and taking what it printed.
 *
 * Every argument is quoted here. External commands use the C locale so
 * machine-readable output and diagnostics have one stable language.
 *
 * Asking the filesystem a question is a different thing and lives in
 * asking.js: a question that comes back "no" has answered, and must not be
 * dressed up as a command that failed.
 */

const LOCALE_PREFIX = "export LC_ALL=C; ";
const HEADER_ARGV_BUDGET = COMMAND_BUDGET_BYTES - utf8Length(LOCALE_PREFIX);

function runCommand(app, command, label) {
    const executing = `${LOCALE_PREFIX}${command}`;
    try {
        return app.doShellScript(executing);
    } catch (caught) {
        const error = hostError(caught);
        const context = label ? ` while ${label}` : "";

        const failure = new OperationError(
            `Command failed${context}.\n\n${errorMessage(error)}`,
            { cause: error, command: executing }
        );

        throw failure;
    }
}

function runArgv(app, argumentsList, label) { return runCommand(app, shellJoin(argumentsList), label); }

function probeArgv(app, argumentsList) {
    return runCommand(app, `${shellJoin(argumentsList)} 2>&1 || true`);
}

function probeImageArgv(app, argumentsList, image) {
    const directory = shellJoin([MKTEMP, "-d", "-t", "image-tool-probe"]);
    const cleanup = `${shellJoin([RM, "--"])} "$probe_dir/image.png"; ${shellJoin([RMDIR, "--"])} "$probe_dir"`;
    const write = `printf '%b' ${shellQuote(image)} >"$probe_dir/image.png"`;
    return runCommand(app, `probe_dir=$(${directory}) && (trap ${shellQuote(cleanup)} EXIT; ${write} && ${shellJoin(argumentsList)} "$probe_dir/image.png") 2>&1`);
}

function runHeaderArgv(app, argumentsList, label) {
    if (commandLengthOf(argumentsList) > HEADER_ARGV_BUDGET) { throw new OperationError("The image header command exceeds the argument budget."); }
    return runArgv(app, argumentsList, label);
}

/*
 * A command whose failure is an answer rather than an error: a temporary file
 * that will not go, a directory that will not empty, a measurement that
 * cannot be taken. Nothing is thrown and nothing is described -- a
 * description is written for somebody to read, and here there is nobody.
 * What silence means is the caller's to decide, and every caller of this has
 * an answer for it.
 */

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

module.exports = { HEADER_ARGV_BUDGET, runHeaderArgv, runArgv, probeArgv, probeImageArgv, removeFile, cleanupArgv };
