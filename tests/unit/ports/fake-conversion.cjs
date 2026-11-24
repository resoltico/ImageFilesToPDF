"use strict";

const { Buffer } = require("node:buffer");
const { posix } = require("node:path");
const { OperationError, UserCanceled } = require("../../../src/core/errors.js");
const { message } = require("../../../src/core/messages.js");
const { outputNameForSeparate } = require("../../../src/core/naming.js");
const { issuesOf } = require("../../../src/core/outcomes.js");
const { headerField } = require("./fake-vipsheader.cjs");

const WORKSPACE = "/work/ImageFilesToPDF";
const PORT_BUDGET = 122880;
const commandBytes = (argv) => argv.reduce((total, argument) => total + Buffer.byteLength(argument) + 1, 0);

function fixtureFiles(options) {
    let identity = 0;
    const files = new Map();
    const put = (path, properties = {}) => {
        const bytes = options.emptyFiles?.includes(path) ? 0 : 1024;
        identity += 1;
        files.set(path, { identity: String(identity), size: bytes, ...properties });
    };
    for (const file of options.files ?? []) { put(file); }
    return { files, put };
}

function pdfOutput({ files }, put, argv) {
    const [, operation,,,,, output] = argv;
    if (operation === "import") {
        const pages = argv.slice(7);
        if (pages.some((path) => !files.has(path))) { throw new Error("An import input is absent."); }
        put(output, { pages: (files.get(output)?.pages ?? 0) + pages.length });
    } else if (operation === "merge") {
        put(output, { pages: argv.slice(7).reduce((total, path) => total + (files.get(path)?.pages ?? 0), 0) });
    } else {
        const file = files.get(argv.at(-1));
        if (!file) { throw new Error("The PDF is absent."); }
        if (operation === "info") { return `Page count: ${file.pages ?? 0}`; }
    }
    return "";
}

function toolOutput(fixture, put, argv) {
    const [tool, operation, field] = argv;
    if (tool.endsWith("/vipsheader")) {
        const paths = argv.slice(operation === "-f" ? 3 : 2);
        const text = headerField(fixture, operation === "-f" ? field : operation);
        if (operation === "-f") { return paths.map(() => text).join("\n"); }
        return paths.length === 1 ? text : paths.map((path) =>
            `${path}: ${fixture.width ?? 600}x${fixture.height ?? 400} uchar, 3 bands, srgb, ${fixture.loader ?? "pngload"}\n${text.split("\n").filter(Boolean).map((line) => `${path}: ${line}`).join("\n")}`).join("\n");
    }
    if (tool.endsWith("/pdfcpu")) { return pdfOutput(fixture, put, argv); }
    if (operation === "avg") { return "0"; }
    if (!fixture.files.has(argv[2])) { throw new Error(`The raster input is absent: ${argv[2]}`); }
    put(argv[3].replace(/\[.*$/u, ""));
    return "";
}

function destinationStaging({ files, directories, occupied, fault, copy, events }) {
    return {
        stagingArea(path) {
            const directory = posix.join(posix.dirname(path), ".ImageFilesToPDF-test");
            return { directory, file: `${directory}/ready.pdf` };
        },
        openStaging({ directory }) {
            fault("openStaging", [directory]);
            if (occupied(directory)) {
                throw new OperationError("The command failed while making a place for the PDF in the output folder.", {
                    diagnostic: { message: "File exists" }
                });
            }
            directories.add(directory);
        },
        closeStaging({ directory, file }) {
            try { fault("closeStaging", [directory]); }
            catch (error) { return issuesOf(error, "cleanup"); }
            files.delete(file);
            directories.delete(directory);
            return [];
        },
        copyBeside(from, to) {
            events.push(["copyBeside", from, to]);
            try { fault("copyBeside", [from, to]); copy(from, to); }
            catch (error) {
                if (error instanceof UserCanceled) { throw error; }
                throw new OperationError("The PDF could not be copied.", { diagnostic: { message: error.message } });
            }
        },
        setAside: (path) => ({ state: "retained", path, issues: [] })
    };
}

function workspaceStorage(files, put) {
    return {
        downloads: "/Downloads/",
        entries(directory) {
            const prefix = `${directory}/`;
            return [...new Set([...files.keys()].filter((path) => path.startsWith(prefix)).map((path) => path.slice(prefix.length).split("/")[0]))];
        },
        write: (path, value) => put(path, { value }),
        remove: (path) => files.delete(path)
    };
}

function nameGroups(images) {
    const keys = new Map();
    return images.map((source) => {
        const path = source.folder + outputNameForSeparate(source);
        if (!keys.has(path)) { keys.set(path, keys.size); }
        return keys.get(path);
    });
}

function createConversionFixture(options = {}) {
    const { files, put } = fixtureFiles(options);
    const directories = new Set(options.directories);
    const occupied = (path) => files.has(path) || directories.has(path) || (options.danglingLinks ?? []).includes(path);
    const facts = (path) => files.get(path) ?? { identity: "", size: -1 };
    const fixture = { files, commands: [], events: [], bands: options.bands ?? 3 };
    const storage = workspaceStorage(files, put);
    function copy(from, to) {
        if (!files.has(from)) { throw new Error("The source is absent."); }
        put(to, { size: facts(from).size });
    }
    function fault(name, args) {
        const result = options.faults?.[name];
        const value = typeof result === "function" ? result(...args) : result;
        if (value instanceof Error) { throw value; }
        return value;
    }
    function remove(name, path, discard) {
        fixture.events.push([name, path]);
        try {
            fault(name, [path]);
            discard();
            return { state: "removed" };
        } catch (error) {
            const [issue] = issuesOf(error, "cleanup");
            return { state: "failed", issue: { ...issue, code: error instanceof UserCanceled ? "canceled" : "cleanup", diagnostic: { path, message: error.message } } };
        }
    }
    const operations = {
        toolPath: (path) => path,
        checkpoint: () => undefined,
        preparationConcurrency: 1,
        fits: (argv) => commandBytes(argv) <= PORT_BUDGET,
        run(argv, label) {
            fixture.commands.push(argv);
            try { return fault("run", [argv, label]) ?? toolOutput(fixture, put, argv); }
            catch (error) {
                if (error instanceof TypeError || error instanceof UserCanceled || error instanceof OperationError) { throw error; }
                throw new OperationError(message("nativeCommandFailedForOperation", { label }), {
                    command: JSON.stringify(argv), diagnostic: { message: error.message }
                });
            }
        },
        resolve: (path) => ({ path }),
        fileKind(path) {
            if (directories.has(path)) { return "directory"; }
            return files.has(path) ? "file" : "unavailable";
        },
        outputName: outputNameForSeparate,
        verifyFile(path, label) {
            if (facts(path).size <= 0) { throw new OperationError(message("fileEmptyOrInvalid", { label, path })); }
        },
        removeFile: (path) => remove("removeFile", path, () => files.delete(path)),
        createWorkspace: () => WORKSPACE,
        removeWorkspace: (path) => remove("removeWorkspace", path, () => {
            for (const file of files.keys()) { if (file.startsWith(`${path}/`)) { files.delete(file); } }
        }),
        ...destinationStaging({ files, directories, occupied, fault, copy, events: fixture.events })
    };
    function link(from, to) {
        if (occupied(to)) { return { state: "exists" }; }
        if (!files.has(from)) { throw new Error("The source is absent."); }
        files.set(to, files.get(from));
        return { state: "created" };
    }
    const publication = { facts, actualPath: (path) => path, link,
        rename(from, to) {
            const result = link(from, to);
            if (result.state === "created") { files.delete(from); }
            return result;
        }
    };
    const sources = {
        facts: (path) => ({ identity: path, version: "1", size: String(facts(path).size) }),
        readable: (path) => files.has(path),
        capture(from, path) { copy(from, path); return { path, identity: from, version: "1" }; },
        pngCount: () => fixture.pages ?? 1
    };
    return Object.assign(fixture, { operations, storage, publication, sources, destinationNames: { groups: nameGroups } });
}

module.exports = { createConversionFixture };
