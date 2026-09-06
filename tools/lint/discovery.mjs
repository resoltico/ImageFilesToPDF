import { readdir } from "node:fs/promises";
import path from "node:path";
import { moduleOrder, root } from "../release.mjs";

const SOURCE_EXTENSIONS = /\.(?:js|mjs|cjs)$/u;
/*
 * dist/ is generated and .git is not ours; the other three are written into
 * the working tree by the toolchain. .stryker-tmp in particular is a copy of
 * this repository, so a walk that descended into it would check the sandbox's
 * files as though they were the repository's own.
 */
const SKIPPED = new Set([
    "node_modules",
    "dist",
    ".git",
    "reports",
    ".stryker-tmp"
]);

/*
 * What counts as a source file, and what is not ours to lint. Both are pure so
 * the decisions can be asserted directly rather than inferred from a walk.
 */
export function isSourceFile(name) {
    return SOURCE_EXTENSIONS.test(name);
}

export function isSkipped(name) {
    return SKIPPED.has(name);
}

function keep(entry) {
    return !isSkipped(entry.name);
}

/*
 * The base directory is a parameter so the walk can be driven against a
 * fixture tree and shown to behave, rather than only observed passing against
 * a repository that already happens to be in order. What counts as a file
 * worth keeping is a parameter too: the same walk finds the documents.
 */
export async function walk(directory, base = root, wanted = isSourceFile) {
    const entries = await readdir(path.join(base, directory), {
        withFileTypes: true
    });
    const found = [];

    for (const entry of entries.filter(keep)) {
        // The empty directory is the root itself, whose entries are named
        // relative to it rather than under a leading separator.
        const relative = directory ? `${directory}/${entry.name}` : entry.name;

        found.push(entry.isDirectory()
            ? await walk(relative, base, wanted)
            : wanted(entry.name) && [relative]);
    }

    return found.flat().filter(Boolean).sort();
}

/*
 * Every file the gate is responsible for.
 *
 * Discovered rather than listed, and recursive, so a new module or a new
 * subdirectory cannot quietly escape the checks. Root-level configuration is
 * included explicitly: it is source too, and it was previously the one file
 * the size limit could not see.
 */
export async function lintableFiles() {
    return [
        ...moduleOrder,
        ...await walk("tools"),
        ...await walk("tests"),
        "eslint.config.mjs"
    ];
}
