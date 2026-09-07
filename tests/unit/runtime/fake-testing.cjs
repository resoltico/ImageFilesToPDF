"use strict";

/*
 * What /bin/test answers about a path.
 *
 * Modelled from the real thing rather than from what the code hopes: -e and
 * -s both pass for a directory, and only -f tells a regular file from one.
 * That distinction is not academic -- a directory standing where the output
 * PDF should go passed the check that a PDF had been written, and the run
 * reported publishing a file it had pushed inside a folder.
 */

function exists(state, path) {
    return state.files.has(path) || state.directories.has(path);
}

function isRegular(state, path) {
    return state.files.has(path) && !state.directories.has(path);
}

function hasContents(state, path) {
    return state.directories.has(path) ||
        (state.files.has(path) && !state.emptyFiles.has(path));
}

function answer(passes) {
    if (!passes) {
        throw new Error("test failed");
    }

    return "";
}

const FLAGS = {
    "-e": exists,
    "-f": isRegular,
    "-s": hasContents,
    "-d": (state, path) => state.directories.has(path),
    "-x": (state, path) => state.runnable.has(path)
};

function testPath(state, rest) {
    const [flag, target] = rest;

    // -f X -a -s X: a regular file with something in it, in one call.
    if (rest.length > 2) {
        return answer(isRegular(state, target) && hasContents(state, target));
    }

    const asks = FLAGS[flag];

    if (!asks) {
        throw new Error(`the fake does not model test ${flag}`);
    }

    return answer(asks(state, target));
}

module.exports = { testPath };
