import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { root } from "../repository.mjs";
import { commentsIn } from "../javascript.mjs";

// eslint-disable-next-line no-control-regex -- This rule exists to find literal control characters, so it must contain them.
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u;

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
 * Fixed system executable paths belong in the engine's executable registry.
 * Node and conversion tools are discovered at run time.
 *
 * A rule about where code lives, checked where the code is written. The
 * property it protects used to be approximated by grepping the built
 * artifact for path-shaped strings, which was checking a shadow: the artifact
 * is a byte-for-byte render of src/, so nothing can be true of one and not
 * the other.
 */
const EXECUTABLES_MODULE = "src/engine/executables.js";

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

/*
 * An ESLint exception must say which rules it suspends and why, in ESLint's
 * own `-- reason` form, so the reason travels with the directive and a bare
 * or blanket suspension cannot pass review unnoticed. Unused directives are
 * the other half: ESLint reports them as errors (eslint.config.mjs).
 */
const DIRECTIVE = /^\s*eslint-(?:disable|enable)(?:-next-line|-line)?(?:\s|$)/u;
const DIRECTIVE_PARTS = /^\s*(?<kind>eslint-(?:disable|enable)(?:-next-line|-line)?)(?<rules>[^]*?)(?:\s--\s+(?<reason>\S[^]*))?$/u;

export function directiveProblems(comments) {
    return comments.filter(({ text }) => DIRECTIVE.test(text)).flatMap(({ text }) => {
        const { kind, rules, reason } = DIRECTIVE_PARTS.exec(text).groups;
        if (kind === "eslint-enable") { return []; }
        if (!rules.trim()) { return [`${kind} names no rule`]; }
        return reason ? [] : [`${kind} ${rules.trim()} gives no "-- reason"`];
    });
}

function checkDisableDirectives(relativePath, content) {
    if (!/\.(?:js|mjs|cjs)$/u.test(relativePath)) { return; }
    const sourceType = relativePath.endsWith(".mjs") ? "module" : "script";
    const problems = directiveProblems(commentsIn(content, "latest", sourceType));
    if (problems.length > 0) {
        throw new Error(`${relativePath}: ${problems.join("; ")}`);
    }
}

export function checkContent(relativePath, content) {
    checkWhitespace(relativePath, content);
    checkControlCharacters(relativePath, content);
    checkExecutables(relativePath, content);
    checkDisableDirectives(relativePath, content);
}

/*
 * Parsed by the same Node that will parse it in anger, then read as text for
 * the structural rules. Both halves address the same file: checking one path
 * and reading another would pass a file nobody looked at.
 */
export async function checkSourceFile(
    relativePath,
    exec = execFileSync,
    read = readFile
) {
    const absolute = path.join(root, relativePath);

    exec(process.execPath, ["--check", absolute], { stdio: "inherit" });

    checkContent(relativePath, await read(absolute, "utf8"));
}
