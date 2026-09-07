"use strict";

/*
 * What /bin/test answers about a path.
 *
 * Modelled from the real thing rather than from what the code hopes: -e and
 * -s both pass for a directory, -e follows a symbolic link and so calls one
 * whose target is gone absent, and only -f tells a regular file from a
 * folder. None of that is academic. A directory standing where the output PDF
 * should go passed the check that a PDF had been written; a link whose target
 * was gone read as a free name while mv replaced it without complaint.
 */

function exists(state, path) {
    return state.files.has(path) || state.directories.has(path);
}

// A symbolic link whose target is gone: -e follows it and finds nothing, -L
// answers about the link itself.
function isLink(state, path) {
    return state.danglingLinks.has(path);
}

function isRegular(state, path) {
    return state.files.has(path) && !state.directories.has(path);
}

function hasContents(state, path) {
    return state.directories.has(path) ||
        (state.files.has(path) && !state.emptyFiles.has(path));
}

/*
 * The two questions asked in one call, each matched as the exact shape it is
 * written in, so a question this fake does not know how to answer is not
 * answered by accident.
 *
 * -f X -a -s X is a regular file with something in it. -e X -o -L X is any
 * entry at all, whether or not a link's target is still there.
 */
const COMBINED = {
    "-a": {
        shape: ["-f", null, "-a", "-s", null],
        holds: (state, path) => isRegular(state, path) && hasContents(state, path)
    },
    "-o": {
        shape: ["-e", null, "-o", "-L", null],
        holds: (state, path) => exists(state, path) || isLink(state, path)
    }
};

function combined(state, rest) {
    const asked = COMBINED[rest[2]];
    const shaped = asked && asked.shape.every(
        (part, at) => part === null || part === rest[at]
    );

    if (!shaped || rest[1] !== rest[4]) {
        throw new Error(`the fake does not model test ${rest.join(" ")}`);
    }

    return asked.holds(state, rest[1]);
}

function answer(passes) {
    if (!passes) {
        throw new Error("test failed");
    }

    return "";
}

const FLAGS = {
    "-e": exists,
    "-L": isLink,
    "-f": isRegular,
    "-s": hasContents,
    "-d": (state, path) => state.directories.has(path),
    "-x": (state, path) => state.runnable.has(path)
};

function testPath(state, rest) {
    const [flag, target] = rest;

    if (rest.length === COMBINED["-a"].shape.length) {
        return answer(combined(state, rest));
    }

    const asks = FLAGS[flag];

    if (!asks) {
        throw new Error(`the fake does not model test ${flag}`);
    }

    return answer(asks(state, target));
}

module.exports = { testPath };
