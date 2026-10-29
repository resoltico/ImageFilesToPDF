import { readFile } from "node:fs/promises";
import path from "node:path";
import { sourceFiles } from "../release.mjs";
import { root } from "../repository.mjs";

export function checkBoundary(file, source) {
    if (!/^src\/(?:core|application)\//u.test(file)) { return; }
    if (/\b(?:Application|ObjC|Ref|globalThis)\b|\$\./u.test(source)) {
        throw new Error(`${file}: host global outside native adapters`);
    }
    for (const match of source.matchAll(/require\("(?<target>[^"]+)"\)/gu)) {
        if (!match.groups.target.startsWith(".")) { throw new Error(`${file}: external dependency ${match.groups.target}`); }
        const target = path.posix.normalize(path.posix.join(path.posix.dirname(file), match.groups.target));
        if (!target.startsWith("src/core/") && !(file.startsWith("src/application/") && target.startsWith("src/application/"))) {
            throw new Error(`${file}: forbidden dependency ${target}`);
        }
    }
}

export async function checkBoundaries(find = sourceFiles, read = readFile) {
    for (const file of await find()) {
        checkBoundary(file, await read(path.join(root, file), "utf8"));
    }
}
