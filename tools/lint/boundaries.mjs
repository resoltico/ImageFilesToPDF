import { readFile } from "node:fs/promises";
import path from "node:path";
import { sourceFiles } from "../release.mjs";
import { parseScript } from "../javascript.mjs";
import { root } from "../repository.mjs";

const ALLOWED = {
    core: ["core"], application: ["core", "application"],
    backend: ["core", "backend"], host: ["core", "application", "backend", "host"],
    entry: ["host"]
};

const HOST_NAMES = new Set(["Application", "ObjC", "Ref", "Path", "Progress", "globalThis", "$"]);

function hasHostGlobal(node) {
    if (!node || typeof node !== "object") { return false; }
    if (node.type === "Identifier" && HOST_NAMES.has(node.name)) { return true; }
    return Object.values(node).some((value) => Array.isArray(value)
        ? value.some(hasHostGlobal) : hasHostGlobal(value));
}

export function checkBoundary(file, source) {
    const layer = file === "src/entry.js" ? "entry" : file.split("/")[1];
    if (!ALLOWED[layer]) { throw new Error(`${file}: unknown source layer`); }
    if (layer !== "host" && hasHostGlobal(parseScript(source, "latest"))) {
        throw new Error(`${file}: host global outside native adapters`);
    }
    for (const match of source.matchAll(/require\("(?<target>[^"]+)"\)/gu)) {
        if (!match.groups.target.startsWith(".")) { throw new Error(`${file}: external dependency ${match.groups.target}`); }
        const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), match.groups.target));
        if (!target.startsWith("src/") || !ALLOWED[layer].includes(target.split("/")[1])) {
            throw new Error(`${file}: forbidden dependency ${target}`);
        }
    }
}

export async function checkBoundaries(find = sourceFiles, read = readFile) {
    for (const file of await find()) {
        checkBoundary(file, await read(path.join(root, file), "utf8"));
    }
}
