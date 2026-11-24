import { readFile } from "node:fs/promises";
import path from "node:path";
import { sourceFiles } from "../release.mjs";
import { parseScript } from "../javascript.mjs";
import { root } from "../repository.mjs";

import { allowsHostGlobals, checkDependency } from "../dependency-rules.mjs";

const HOST_NAMES = new Set(["Application", "ObjC", "Ref", "Path", "Progress", "globalThis", "$"]);

function hasHostGlobal(node) {
    if (!node || typeof node !== "object") { return false; }
    if (node.type === "Identifier" && HOST_NAMES.has(node.name)) { return true; }
    return Object.values(node).some((value) => Array.isArray(value)
        ? value.some(hasHostGlobal) : hasHostGlobal(value));
}

export function checkBoundary(file, source) {
    if (!allowsHostGlobals(file) && hasHostGlobal(parseScript(source, "latest"))) {
        throw new Error(`${file}: host global outside native adapters`);
    }
    for (const match of source.matchAll(/require\("(?<target>[^"]+)"\)/gu)) {
        const name = match.groups.target;
        const target = name.startsWith(".") ? path.posix.normalize(path.posix.join(path.posix.dirname(file), name)) : name;
        checkDependency(file, target);
    }
}

export async function checkBoundaries(find = sourceFiles, read = readFile) {
    for (const file of await find()) {
        checkBoundary(file, await read(path.join(root, file), "utf8"));
    }
}
