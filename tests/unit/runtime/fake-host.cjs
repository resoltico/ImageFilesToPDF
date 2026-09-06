"use strict";

/*
 * A fake JXA host with a small in-memory filesystem.
 *
 * The runtime reaches the filesystem only through /bin/test, /bin/mv,
 * /bin/cp, /usr/bin/stat and /bin/rm, and produces files only through vips
 * and pdfcpu. Modelling those
 * few commands is enough to drive the publication logic — including the
 * non-clobbering move, which a stateless stub cannot exercise.
 */

const { createFilesystem } = require("./fake-filesystem.cjs");
const { headerField } = require("./fake-vipsheader.cjs");

const WORKSPACE = "/var/folders/xx/T/ImageFilesToPDF.Fake01";

/*
 * A healthy machine by default: the tools are installed where Homebrew puts
 * them. A test that wants a missing tool overrides `executables`.
 */
const INSTALLED_TOOLS = [
    "/opt/homebrew/bin/vips",
    "/opt/homebrew/bin/vipsheader",
    "/opt/homebrew/bin/pdfcpu"
];

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
        "/usr/bin/mktemp": () => `${WORKSPACE}\n`,
        "/usr/bin/printenv": () => {
            throw new Error("unset");
        },
        "/bin/test": () => fs.test(rest),
        "/bin/mv": () => fs.move(rest),
        "/bin/cp": () => fs.copy(rest),
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

/*
 * The preflight probes deliberately name a file that cannot exist; a
 * healthy tool answers about the file, not about the flags. A test can
 * override `preflight` to stand in for an outdated tool, or `brew` for a
 * machine without Homebrew.
 */
function setupAnswer(host, command) {
    if (command.includes("nonexistent-image-files-to-pdf-preflight")) {
        return host.preflight ?? (command.includes("pdfcpu")
            ? "validating(mode=strict) ... no such file"
            : "VipsForeignLoad: file does not exist");
    }

    if (command.includes("command -v brew")) {
        return host.brew ?? "/opt/homebrew/bin/brew";
    }

    return undefined;
}

function dialogSurface(host) {
    return {
        displayDialog(message, options) {
            host.dialogs.push({ message, options });

            return { textReturned: host.nextAnswer ?? "92" };
        },

        chooseFromList(choices) {
            host.listPrompts.push(choices);

            return host.nextChoice === undefined
                ? [choices[0]]
                : host.nextChoice;
        }
    };
}

function createFakeHost(settings = {}) {
    const fs = createFilesystem(
        settings.files ?? [],
        settings.executables ?? INSTALLED_TOOLS,
        settings.emptyFiles ?? []
    );
    const failures = settings.failures ?? [];
    const host = {
        files: fs.files,
        sizes: fs.sizes,
        commands: [],
        dialogs: [],
        listPrompts: [],
        bands: settings.bands ?? 3,
        includeStandardAdditions: false,

        doShellScript(command) {
            host.commands.push(command);

            const answered = setupAnswer(host, command);

            if (answered !== undefined) {
                return answered;
            }

            for (const [needle, result] of failures) {
                if (command.includes(needle)) {
                    if (result instanceof Error) {
                        throw result;
                    }

                    return result;
                }
            }

            return dispatch(fs, parseArgv(command), command, host);
        }
    };

    return Object.assign(host, dialogSurface(host));
}

module.exports = { createFakeHost, parseArgv, WORKSPACE };
