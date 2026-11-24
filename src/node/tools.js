"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Buffer } = require("node:buffer");
const { env } = require("node:process");
const { OperationError } = require("../core/errors.js");
const {
    buildVipsProbeArgv, buildVipsheaderProbeArgv, isVipsheaderUsable, VIPSHEADER_PROBE_IMAGE,
    buildPdfcpuProbeArgv, isPdfcpuUsable
} = require("../backend/preflight.js");
const { WINDOWS, localPath, standardize } = require("./paths.js");

const { MINIMUM_PDFCPU_VERSION } = require("../backend/preflight.js");

const TOOL_NAMES = ["vips", "vipsheader", "pdfcpu"];

function isExecutable(file) {
    try {
        if (!path.isAbsolute(file) || (WINDOWS && path.extname(file).toLowerCase() !== ".exe") || !fs.statSync(file).isFile()) { return false; }
        if (!WINDOWS) { fs.accessSync(file, fs.constants.X_OK); }
        return true;
    } catch { return false; }
}

function fileAt(value) {
    try {
        if (!path.isAbsolute(value)) { return null; }
        const file = localPath(value);
        return isExecutable(file) ? file : null;
    } catch { return null; }
}

function executable(name) {
    const override = `IMAGE_FILES_TO_PDF_${name.toUpperCase()}`;
    if (Object.hasOwn(env, override)) {
        const value = env[override];
        const file = fileAt(value);
        if (!file) { throw new OperationError(`${override}=${JSON.stringify(value)} is not an absolute regular executable file.`); }
        return { file, override };
    }
    const search = WINDOWS ? Object.entries(env).find(([key]) => key.toUpperCase() === "PATH")?.[1] : env.PATH;
    const filename = WINDOWS ? `${name}.exe` : name;
    for (const directory of (search ?? "").split(path.delimiter).filter((entry) => path.isAbsolute(entry))) {
        const file = fileAt(path.join(directory, filename));
        if (file) { return { file, override: null }; }
    }
    throw new OperationError(`${name} is not installed on the absolute executable search path.`);
}

function validateTool(commands, argv, usable, { name, file, override }) {
    commands.checkpoint();
    const result = commands.request(argv);
    if (result.status !== 0 || result.error || !usable(result.stdout)) {
        const selected = override ? `${override}=${JSON.stringify(file)}` : name;
        const prerequisite = name === "pdfcpu" ? ` Version ${MINIMUM_PDFCPU_VERSION} or later is required.` : "";
        throw new OperationError(`${selected} failed its capability check.${prerequisite} ${(result.error || result.stderr || result.stdout || "").trim()}`.trimEnd());
    }
}

function checkTools(commands) {
    const found = Object.fromEntries(TOOL_NAMES.map((name) => [name, { name, ...executable(name) }]));
    const tools = Object.fromEntries(Object.entries(found).map(([name, tool]) => [name, tool.file]));
    commands.checkpoint();
    validateTool(commands, buildPdfcpuProbeArgv(tools.pdfcpu), isPdfcpuUsable, found.pdfcpu);
    const directory = fs.mkdtempDisposableSync(path.join(os.tmpdir(), "iftp-check-"));
    try {
        const probe = standardize(path.join(directory.path, "test é.png"));
        const output = standardize(path.join(directory.path, "output.png"));
        const octal = [...VIPSHEADER_PROBE_IMAGE.matchAll(/\\0(?<byte>[0-7]{3})/gu)].map((match) => Number.parseInt(match.groups.byte, 8));
        fs.writeFileSync(probe, Buffer.from(octal), { flag: "wx", mode: 0o600 });
        const args = buildVipsProbeArgv(tools.vips);
        const firstPath = 2, pathCount = 2;
        args.splice(firstPath, pathCount, probe, output);
        validateTool(commands, args, () => fs.statSync(output, { throwIfNoEntry: false })?.isFile(), found.vips);
        validateTool(commands, [...buildVipsheaderProbeArgv(tools.vipsheader), probe], isVipsheaderUsable, found.vipsheader);
    } finally { directory.remove(); }
    return tools;
}
module.exports = { checkTools };
