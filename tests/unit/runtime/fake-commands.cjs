"use strict";

/*
 * The handful of commands the runtime actually reaches the filesystem
 * through, and how a shell command is read back into an argument vector.
 */

const { headerField } = require("./fake-vipsheader.cjs");

const TEMPORARY = "/var/folders/xx/T";

/*
 * mktemp -d -t PREFIX makes a directory named after the prefix it was given,
 * so a recovery folder is a different directory from the workspace. A stub
 * that answered with the same path either way made a rescued PDF look like it
 * had never left the workspace it was rescued from.
 */
function temporaryDirectory(rest) {
    const prefix = rest[rest.indexOf("-t") + 1];

    return `${TEMPORARY}/${prefix}.Fake01\n`;
}

function parseArgv(command) {
    const argv = [];

    for (const match of command.matchAll(/'(?<value>(?:[^']|'\\'')*)'/gu)) {
        argv.push(match.groups.value.split("'\\''").join("'"));
    }

    return argv;
}

function dispatch(fs, argv, command, host) {
    const [tool, ...rest] = argv;
    const handlers = {
        // mktemp terminates its answer with a newline, as the real one does:
        // a caller that does not trim ends up with a path containing one.
        "/usr/bin/mktemp": () => temporaryDirectory(rest),
        "/usr/bin/printenv": () => {
            throw new Error("unset");
        },
        "/bin/test": () => fs.test(rest),
        "/bin/mv": () => fs.move(rest),
        "/bin/cp": () => fs.copy(rest),
        "/bin/ln": () => fs.link(rest),
        "/usr/bin/stat": () => fs.stat(rest),
        "/bin/rm": () => fs.remove(rest)
    };

    if (Object.hasOwn(handlers, tool)) {
        return handlers[tool]();
    }

    if (command.includes("vipsheader")) {
        return headerField(host, command);
    }

    return fs.produce(argv, command);
}

module.exports = { parseArgv, dispatch, TEMPORARY };
