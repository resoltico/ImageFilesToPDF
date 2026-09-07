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
function asks(app, argumentsList) {
    try {
        app.doShellScript(shellJoin([TEST, ...argumentsList]));

        return true;
    } catch {
        return false;
    }
}

function testPath(app, flag, target) {
    return asks(app, [flag, target]);
}

/*
 * Whether there is any directory entry at this path -- which is the question
 * an output name poses, and not the one -e answers.
 *
 * -e follows a symbolic link and reports on its target, so a link whose
 * target is gone reads as nothing at all. Something is still there: measured,
 * mv replaces such a link without complaint while ln refuses the name. -L
 * asks about the entry itself, and the two together cover files, folders and
 * links alike, in one call.
 */
function pathIsTaken(app, path) {
    return asks(app, ["-e", path, "-o", "-L", path]);
}

function isRegularFile(app, path) {
    return testPath(app, "-f", path);
}

// A folder is not an image, and saying so is not the same as saying its name
// has the wrong extension.
function isDirectory(app, path) {
    return testPath(app, "-d", path);
}

function isExecutable(app, path) {
    return testPath(app, "-x", path);
}

function fileExists(app, path) {
    return testPath(app, "-e", path);
}

/*
 * A regular file with something in it. Asked in one call because there are
 * five of these per image and a second subprocess each would be five
 * thousand more on a job of a thousand photographs.
 *
 * -s alone passes a directory: measured, and it is how a PDF moved inside a
 * directory that appeared at the output path was reported as published.
 */
function isRegularNonEmpty(app, path) {
    try {
        app.doShellScript(shellJoin([TEST, "-f", path, "-a", "-s", path]));

        return true;
    } catch {
        return false;
    }
}

function verifyFileWritten(app, path, label) {
    if (!isRegularNonEmpty(app, path)) {
        throw new Error(
            `${label} is not a file with anything in it:\n\n${path}`
        );
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
    isDirectory,
    isExecutable,
    fileExists,
    pathIsTaken,
    verifyFileWritten,
    removeFile
};
