"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Buffer } = require("node:buffer");
const { env, platform } = require("node:process");
const { checkRequiredTools } = require("../application/setup.js");
const { VIPSHEADER_PROBE_IMAGE } = require("../backend/preflight.js");
const { WINDOWS, localPath, standardize } = require("./paths.js");

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

function locate(name, directories) {
    const variable = `IMAGE_FILES_TO_PDF_${name.toUpperCase()}`;
    if (Object.hasOwn(env, variable)) {
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
        return await inspect({ input, output, outputExists: () => fs.statSync(output, { throwIfNoEntry: false })?.isFile() });
    } finally { directory.remove(); }
}

function checkTools(commands, directories = inheritedSearch()) {
    return checkRequiredTools({ platform, checkpoint: commands.checkpoint, locate: (name) => locate(name, directories), run: commands.request, withSample });
}
module.exports = { checkTools };
