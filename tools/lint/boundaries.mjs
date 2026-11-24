import { readFile } from "node:fs/promises";
import path from "node:path";
import { isBuiltin } from "node:module";
import { sourceFiles } from "../release.mjs";
import { parseScript } from "../javascript.mjs";
import { root } from "../repository.mjs";

const ALLOWED = {
    core: ["core"], application: ["core", "application", "backend"],
    backend: ["core", "backend"], host: ["core", "host"],
    node: ["node", "application", "core", "backend"], serve: ["serve", "node", "core"], entry: ["host"]
};

const CLI_MODULES = new Set(["src/node/entry.js", "src/node/request.js", "src/node/transport.js"]);

const HOST_NAMES = new Set(["Application", "ObjC", "Ref", "Path", "Progress", "globalThis", "$"]);

function hasHostGlobal(node) {
    if (!node || typeof node !== "object") { return false; }
    if (node.type === "Identifier" && HOST_NAMES.has(node.name)) { return true; }
    return Object.values(node).some((value) => Array.isArray(value)
        ? value.some(hasHostGlobal) : hasHostGlobal(value));
}

function hostInterface(file) {
    return /^src\/host\/(?<name>quick-action)\//u.exec(file)?.groups.name;
}

export function checkBoundary(file, source) {
    const layer = file === "src/entry.js" ? "entry" : file.split("/")[1];
    if (!ALLOWED[layer]) { throw new Error(`${file}: unknown source layer`); }
    if (!["host", "node", "serve"].includes(layer) && hasHostGlobal(parseScript(source, "latest"))) {
        throw new Error(`${file}: host global outside native adapters`);
    }
    for (const match of source.matchAll(/require\("(?<target>[^"]+)"\)/gu)) {
        const name = match.groups.target;
        if (name.startsWith(".")) {
            const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), name));
            if (layer === "host" && hostInterface(target) && hostInterface(file) !== hostInterface(target)) {
                throw new Error(`${file}: forbidden host interface dependency ${target}`);
            }
            if (!target.startsWith("src/") || !ALLOWED[layer].includes(target.split("/")[1]) ||
                (layer === "serve" && CLI_MODULES.has(target))) {
                throw new Error(`${file}: forbidden dependency ${target}`);
            }
        } else if (!(["node", "serve"].includes(layer) && name.startsWith("node:") && isBuiltin(name))) {
            throw new Error(`${file}: external dependency ${name}`);
        }
    }
}

export async function checkBoundaries(find = sourceFiles, read = readFile) {
    for (const file of await find()) {
        checkBoundary(file, await read(path.join(root, file), "utf8"));
    }
}
