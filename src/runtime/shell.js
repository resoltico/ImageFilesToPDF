"use strict";

const { CAT, RM } = require("../core/executables.js");
const { shellJoin } = require("../core/shell.js");
const { errorMessage, summarizeCommand } = require("../core/errors.js");

/*
 * Running a command and taking what it printed.
 *
 * Every command is built as an argument vector and quoted here, so no caller
 * ever assembles a command string by concatenation.
 *
 * Asking the filesystem a question is a different thing and lives in
 * asking.js: a question that comes back "no" has answered, and must not be
 * dressed up as a command that failed.
 */

function runArgv(app, argumentsList, label) {
    const command = shellJoin(argumentsList);

    try {
        return app.doShellScript(command);
    } catch (error) {
        const context = label ? ` while ${label}` : "";

        const failure = new Error(
            `Command failed${context}.\n\n${errorMessage(error)}`,
            { cause: error }
        );

        // Carried alongside the message so the presenter can decide: shown in
        // a log, withheld from a dialog.
        failure.command = summarizeCommand(command);

        throw failure;
    }
}

/*
 * A command whose failure is an answer rather than an error: a temporary file
 * that will not go, a directory that will not empty, a measurement that
 * cannot be taken. Nothing is thrown and nothing is described -- a
 * description is written for somebody to read, and here there is nobody.
 * What silence means is the caller's to decide, and every caller of this has
 * an answer for it.
 */
function tryArgv(app, argumentsList) {
    try {
        return app.doShellScript(shellJoin(argumentsList));
    } catch {
        return "";
    }
}

function readTextFile(app, path) {
    return runArgv(app, [CAT, path], "reading headless configuration");
}

function removeFile(app, path) {
    if (!path) {
        return;
    }

    // A temporary file that cannot be removed must not fail the run.
    tryArgv(app, [RM, "-f", path]);
}

module.exports = { runArgv, tryArgv, readTextFile, removeFile };
