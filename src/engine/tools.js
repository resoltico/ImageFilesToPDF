"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Buffer } = require("node:buffer");
const { env, platform } = require("node:process");
const { checkRequiredTools } = require("../application/setup.js");
const { VIPSHEADER_PROBE_IMAGE } = require("../backend/preflight.js");
const { WINDOWS, localPath, standardize, toolPath } = require("./paths.js");
const { SYSTEM_PATHS, SYSTEM_FRAGMENTS, searchDirectories } = require("../core/executable-search.js");

function executableFile(value) {
    try {
        if (!path.isAbsolute(value) || WINDOWS && path.extname(value).toLowerCase() !== ".exe") { return null; }
        const file = localPath(value);
        if (!fs.statSync(file).isFile()) { return null; }
        if (!WINDOWS) { fs.accessSync(file, fs.constants.X_OK); }
        return file;
    } catch { return null; }
}

function inheritedSearch() {
    const search = WINDOWS ? Object.entries(env).find(([key]) => key.toUpperCase() === "PATH")?.[1] : env.PATH;
    return (search ?? "").split(path.delimiter);
}

function finderSearch() {
    function read(file) {
        try { return fs.lstatSync(file).isFile() ? fs.readFileSync(file, "utf8") : ""; }
        catch { return ""; }
    }
    let names = [];
    try { names = fs.readdirSync(SYSTEM_FRAGMENTS); } catch {
        // The fragment directory is optional.
    }
    const fragments = Object.fromEntries(names.map((name) => [name, read(path.join(SYSTEM_FRAGMENTS, name))]));
    return searchDirectories({ systemPaths: { defaults: read(SYSTEM_PATHS), fragments } });
}

function locate(name, directories, toolPaths) {
    if (toolPaths && Object.hasOwn(toolPaths, name)) {
        const chosen = toolPaths[name];
        return { file: executableFile(chosen), override: { path: chosen } };
    }
    const variable = `IMAGE_FILES_TO_PDF_${name.toUpperCase()}`;
    if (!toolPaths && Object.hasOwn(env, variable)) {
        const value = env[variable];
        return { file: executableFile(value), override: { variable, value } };
    }
    const filename = WINDOWS ? `${name}.exe` : name;
    for (const directory of directories.filter((entry) => path.isAbsolute(entry))) {
        const file = executableFile(path.join(directory, filename));
        if (file) { return { file }; }
    }
    return { file: null };
}

async function withSample(inspect) {
    const directory = fs.mkdtempDisposableSync(path.join(os.tmpdir(), "iftp-check-"));
    try {
        const input = standardize(path.join(directory.path, "test é.png"));
        const output = standardize(path.join(directory.path, "output.png"));
        const octal = [...VIPSHEADER_PROBE_IMAGE.matchAll(/\\0(?<byte>[0-7]{3})/gu)].map((match) => Number.parseInt(match.groups.byte, 8));
        fs.writeFileSync(input, Buffer.from(octal), { flag: "wx", mode: 0o600 });
        return await inspect({ input: toolPath(input), output: toolPath(output), outputExists: () => fs.statSync(output, { throwIfNoEntry: false })?.isFile() });
    } finally { directory.remove(); }
}

function checkTools(commands, toolPaths) {
    const directories = toolPaths ? finderSearch() : inheritedSearch();
    return checkRequiredTools({ platform, checkpoint: commands.checkpoint, locate: (name) => locate(name, directories, toolPaths), run: commands.request, withSample });
}
module.exports = { checkTools };
