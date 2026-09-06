"use strict";

const { CAT, RM, TEST } = require("../core/executables.js");
const { shellJoin } = require("../core/shell.js");
const { errorMessage, summarizeCommand } = require("../core/errors.js");

/*
 * Shell execution and filesystem predicates.
 *
 * Every command is built as an argument vector and quoted here, so no caller
 * ever assembles a command string by concatenation.
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

function readTextFile(app, path) {
    return runArgv(app, [CAT, path], "reading headless configuration");
}

/*
 * A failing test is an answer, not an error. This deliberately does not go
 * through runArgv: that would build a described Error, complete with a
 * summarised command, for every probe that simply returns false.
 */
function testPath(app, flag, target) {
    try {
        app.doShellScript(shellJoin([TEST, flag, target]));

        return true;
    } catch {
        return false;
    }
}

function isRegularFile(app, path) {
    return testPath(app, "-f", path);
}

function isExecutable(app, path) {
    return testPath(app, "-x", path);
}

function fileExists(app, path) {
    return testPath(app, "-e", path);
}

function verifyFileWritten(app, path, label) {
    if (!testPath(app, "-s", path)) {
        throw new Error(`${label} was not written or is empty:\n\n${path}`);
    }
}

function removeFile(app, path) {
    if (!path) {
        return;
    }

    try {
        runArgv(app, [RM, "-f", path], "removing temporary file");
    } catch {
        // A temporary file that cannot be removed must not fail the run.
    }
}

module.exports = {
    runArgv,
    readTextFile,
    isRegularFile,
    isExecutable,
    fileExists,
    verifyFileWritten,
    removeFile
};
