"use strict";
const { workspacePort } = require("./fake-workspace.cjs");

const { boundedDialog } = require("./fake-dialogs.cjs");

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
const {
    parseArgv,
    dispatch,
    TEMPORARY
} = require("./fake-commands.cjs");

const WORKSPACE = `${TEMPORARY}/ImageFilesToPDF.Fake01`;

/*
 * A healthy machine by default: the tools are installed where Homebrew puts
 * them. A test that wants a missing tool overrides `executables`.
 */
const INSTALLED_TOOLS = [
    "/opt/homebrew/bin/vips",
    "/opt/homebrew/bin/vipsheader",
    "/opt/homebrew/bin/pdfcpu"
];

/*
 * vips answers about the missing probe file; pdfcpu reports its version.
 * A test can override `preflight` to stand in for an unusable tool, or `brew` for a
 * machine without Homebrew.
 */
function setupAnswer(host, command) {
    if (command.includes("nonexistent-image-files-to-pdf-preflight") ||
        (command.includes("pdfcpu") && command.includes("'version'"))) {
        return host.preflight ?? (command.includes("pdfcpu")
            ? "version: v0.16.4"
            : "VipsForeignLoad: file does not exist");
    }

    if (command.includes("command -v brew")) {
        return host.brew ?? "/opt/homebrew/bin/brew";
    }

    return undefined;
}

/*
 * What a test has arranged to happen instead. A function answers differently
 * as the run goes on, which is how a name becomes occupied while a copy is
 * still being made.
 */
function injectedAnswer(failures, command) {
    for (const [needle, result] of failures) {
        if (command.includes(needle)) {
            return typeof result === "function" ? result(command) : result;
        }
    }

    return undefined;
}

/*
 * What renamex_np with RENAME_EXCL does: move the file, refusing a
 * destination that is there. A test gives the host a different one to stand
 * for a filesystem that cannot do it at all.
 */
function renamerOn(fs) {
    return { renamer: { rename: (from, to) => fs.exclusiveRename(from, to) } };
}

function dialogSurface(host) {
    return {
        displayDialog(message, options) {
            host.dialogs.push({ message, options });

            return { textReturned: host.nextAnswer ?? "92", buttonReturned: options.defaultButton };
        },

        chooseFromList(choices) {
            host.listPrompts.push(choices);

            return host.nextChoice === undefined
                ? [choices[0]]
                : host.nextChoice;
        }
    };
}

function nativePorts(fs, host) {
    const publication = {
        facts: fs.facts,
        link(from, to) {
            try { fs.test(["-e", to, "-o", "-L", to]); return { state: "exists" }; } catch {
                // This fixture positively classified the path as unoccupied.
            }
            fs.link([from, to]);
            return { state: "created" };
        },
        rename(from, to) { return { state: fs.exclusiveRename(from, to) ? "created" : "exists" }; }
    };
    const sources = {
        facts: (path) => ({ identity: path, version: "1", size: String(fs.facts(path).size) }),
        readable: (path) => fs.files.has(path),
        capture(from, path) { fs.copy([from, path]); return { path, identity: from, version: "1" }; },
        pngCount: () => host.pages ?? 1
    };
    return { publication, sources };
}

function shellFailure(error, command) {
    if (command.includes("printenv") && error.errorNumber === undefined) { error.errorNumber = 1; }
    return error;
}

function createFakeHost(settings = {}) {
    const fs = createFilesystem(
        settings.files ?? [],
        settings.executables ?? INSTALLED_TOOLS,
        settings.emptyFiles ?? [],
        {
            directories: settings.directories ?? [],
            danglingLinks: settings.danglingLinks ?? []
        }
    );
    const failures = settings.failures ?? [];
    const host = {
        files: fs.files,
        fileTexts: new Map(Object.entries(settings.fileTexts ?? {})),
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

            const injected = injectedAnswer(failures, command);

            if (injected !== undefined) {
                if (injected instanceof Error) {
                    throw shellFailure(injected, command);
                }

                return injected;
            }

            return dispatch(fs, parseArgv(command), command, host);
        }
    };

    host.storage = workspacePort(host);
    const surface = dialogSurface(host);

    surface.displayDialog = boundedDialog(surface.displayDialog);

    return Object.assign(host, surface, renamerOn(fs), nativePorts(fs, host));
}

module.exports = { createFakeHost, parseArgv, WORKSPACE };
