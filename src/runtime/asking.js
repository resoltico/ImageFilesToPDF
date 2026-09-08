"use strict";

const { TEST } = require("../core/executables.js");
const { shellJoin } = require("../core/shell.js");

/*
 * Questions put to the filesystem, answered by whether a command succeeded.
 *
 * These do not go through runArgv, and that is the point of keeping them
 * apart: runArgv builds a described Error with a summarised command for
 * anything that fails, which is right for a command that was meant to do
 * something and wrong for one that was only ever a question. A test that
 * fails has answered.
 *
 * What a caller must not do is read a "no" as a fact about the file. Every
 * answer here is really "the test succeeded", and a test that could not be
 * run at all says no in the same words. Nothing may be deleted or given up
 * on the strength of one.
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

module.exports = {
    isRegularFile,
    isDirectory,
    isExecutable,
    pathIsTaken,
    verifyFileWritten
};
