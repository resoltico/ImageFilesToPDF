import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { root } from "../release.mjs";

// This rule exists to find literal control characters, so it must contain them.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u;

/*
 * No file may grow back into a god file. The threshold sits close to the
 * largest current module, so growth is a decision rather than a drift.
 */
export const MAXIMUM_FILE_LINES = 150;
const HEX_RADIX = 16;
const CODE_POINT_DIGITS = 4;

function checkControlCharacters(relativePath, content) {
    /*
     * The release is distributed by copy and paste into the Shortcuts editor,
     * so a literal control character would be invisible here and corrupting
     * there. They must be written as escapes.
     */
    const control = CONTROL_CHARACTERS.exec(content);

    if (!control) {
        return;
    }

    const line = content.slice(0, control.index).split("\n").length;
    const code = control[0].codePointAt(0).toString(HEX_RADIX).toUpperCase();

    throw new Error(
        `${relativePath}:${line}: literal control character ` +
        `U+${code.padStart(CODE_POINT_DIGITS, "0")}; write it as an escape instead`
    );
}

export function checkSize(relativePath, content) {
    const lines = content.split("\n").length - 1;

    if (lines > MAXIMUM_FILE_LINES) {
        throw new Error(
            `${relativePath}: ${lines} lines exceeds the ` +
            `${MAXIMUM_FILE_LINES}-line limit; split it rather than raising ` +
            "the limit"
        );
    }
}

function checkWhitespace(relativePath, content) {
    if (!content.endsWith("\n")) {
        throw new Error(`${relativePath}: missing final newline`);
    }

    if (/[ \t]+$/mu.test(content)) {
        throw new Error(`${relativePath}: trailing whitespace`);
    }

    if (content.includes("\r")) {
        throw new Error(`${relativePath}: CR characters are forbidden`);
    }
}

/*
 * The textual rules, separated from the file I/O so they can be exercised
 * directly rather than only through a file on disk.
 */
/*
 * Every binary the action runs is named in src/core/executables.js and
 * nowhere else, so the external surface of the artifact is a file you can
 * read rather than a fact to reassemble from five modules.
 *
 * A rule about where code lives, checked where the code is written. The
 * property it protects used to be approximated by grepping the built
 * artifact for path-shaped strings, which was checking a shadow: the artifact
 * is a byte-for-byte render of src/, so nothing can be true of one and not
 * the other.
 */
const EXECUTABLES_MODULE = "src/core/executables.js";

const ABSOLUTE_EXECUTABLE =
    /"(?<path>\/(?:s?bin|usr\/s?bin|usr\/local\/bin|opt\/(?:homebrew|local)\/bin)\/[\w.-]+)"/gu;

export function executablePathsIn(content) {
    return [...new Set(
        [...String(content).matchAll(ABSOLUTE_EXECUTABLE)]
            .map((match) => match.groups.path)
    )].sort();
}

function checkExecutables(relativePath, content) {
    // The rule is about what the shipped action runs. A test naming a path as
    // a fixture is asserting against it, not invoking it.
    if (!relativePath.startsWith("src/") || relativePath === EXECUTABLES_MODULE) {
        return;
    }

    const named = executablePathsIn(content);

    if (named.length > 0) {
        throw new Error(
            `${relativePath}: names ${named.join(", ")} directly; every ` +
            `executable belongs in ${EXECUTABLES_MODULE}, which is the one ` +
            "place the action's external surface is written down"
        );
    }
}

export function checkContent(relativePath, content) {
    checkWhitespace(relativePath, content);
    checkControlCharacters(relativePath, content);
    checkExecutables(relativePath, content);
    checkSize(relativePath, content);
}

export async function checkSourceFile(relativePath) {
    const absolute = path.join(root, relativePath);

    execFileSync(process.execPath, ["--check", absolute], { stdio: "inherit" });

    checkContent(relativePath, await readFile(absolute, "utf8"));
}
