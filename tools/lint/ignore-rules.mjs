import { readFromDisk } from "./consistency.mjs";

/*
 * What the ignore file must cover, and what it must never cover.
 *
 * The second half is the one that matters. `dist/` holds the released
 * artifact and is committed on purpose. If it were ever ignored, the
 * committed artifact would quietly stop updating while every local check kept
 * passing — check-dist compares the working tree against src/, not against
 * git — and the next release would publish whatever was committed last.
 */

// Written into the working tree by the toolchain, never committed.
const GENERATED = ["node_modules/", "reports/", ".stryker-tmp/"];

const COMMITTED = ["dist/"];

export function parseIgnore(text) {
    return String(text)
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "" && !line.startsWith("#"));
}

function bare(pattern) {
    return pattern.replace(/^\//u, "").replace(/\/$/u, "");
}

/*
 * Last match wins, which is how git resolves a pattern and a later negation
 * of it.
 */
export function ignoresPath(patterns, path) {
    let ignored = false;

    for (const pattern of patterns) {
        const negated = pattern.startsWith("!");

        if (bare(negated ? pattern.slice(1) : pattern) === bare(path)) {
            ignored = !negated;
        }
    }

    return ignored;
}

export function checkIgnoreRules(patterns) {
    const uncovered = GENERATED.filter((path) => !ignoresPath(patterns, path));

    if (uncovered.length > 0) {
        throw new Error(
            "the toolchain writes these into the working tree and the ignore " +
            `file does not cover them: ${uncovered.join(", ")}`
        );
    }

    const hidden = COMMITTED.filter((path) => ignoresPath(patterns, path));

    if (hidden.length > 0) {
        throw new Error(
            `${hidden.join(", ")} is committed on purpose and must not be ` +
            "ignored; ignoring it would stop the released artifact updating " +
            "while every other check kept passing"
        );
    }

    return patterns.length;
}

export async function checkIgnores(read = readFromDisk) {
    return checkIgnoreRules(parseIgnore(await read(".gitignore")));
}
