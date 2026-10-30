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
        "/bin/ps": () => argv.includes("-axo") ? "123 Thu Oct 29 10:00:00 2026\n" : "Thu Oct 29 10:00:00 2026\n",
        "/usr/bin/mktemp": () => temporaryDirectory(rest),
        "/usr/bin/printenv": () => {
            throw Object.assign(new Error("unset"), { errorNumber: 1 });
        },
        "/bin/test": () => fs.test(rest),
        "/bin/mkdir": () => fs.makeDirectory(rest),
        "/bin/rmdir": () => fs.removeDirectory(rest),
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
        const text = headerField(host, command);
        const paths = argv.slice(argv[1] === "-f" ? 3 : 2);
        if (argv[1] === "-f") { return paths.map(() => text).join("\n"); }
        return paths.length > 1 ? paths.map((path) =>
            `${path}: ${host.width ?? 600}x${host.height ?? 400} uchar, 3 bands, srgb, ${host.loader ?? "pngload"}\n${text.split("\n").filter(Boolean).map((line) => `${path}: ${line}`).join("\n")}`).join("\n") : text;
    }

    return fs.produce(argv, command);
}

module.exports = { parseArgv, dispatch, TEMPORARY };
