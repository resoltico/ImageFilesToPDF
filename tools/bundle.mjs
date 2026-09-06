/*
 * Assembly of the single-file release artifact.
 *
 * The sources are ordinary CommonJS modules so each can be required and unit
 * tested on its own. The artifact must be one file to paste into the Shortcuts
 * editor, so the module bodies are concatenated with their `require` and
 * `module.exports` lines removed. Everything then shares one script scope,
 * cross-module calls resolve naturally, and `run` stays a top-level function
 * where osascript can find it.
 */
import path from "node:path";

const REQUIRE_PATTERN =
    /^const \{[\s\S]*?\} = require\("(?<target>[^"]+)"\);\n/gmu;
const EXPORTS_PATTERN = /\nmodule\.exports = \{[\s\S]*?\};\n?$/u;
const USE_STRICT_PATTERN = /^"use strict";\n+/u;
const TOP_LEVEL_DECLARATION =
    /^(?:function|const|let|var)\s+(?<name>[A-Za-z_$][\w$]*)/gmu;

function assertBundled(relativePath, requires, seenModules, root) {
    for (const target of requires) {
        const resolved = path
            .relative(
                root,
                path.resolve(root, path.dirname(relativePath), target)
            )
            .split(path.sep)
            .join("/");

        if (!seenModules.has(resolved)) {
            throw new Error(
                `${relativePath} requires ${target}, which is not bundled ` +
                "before it (add it earlier in moduleOrder)"
            );
        }
    }
}

function assertStripped(relativePath, body) {
    if (/\brequire\s*\(/u.test(body)) {
        throw new Error(
            `${relativePath}: an unrecognised require survived bundling`
        );
    }

    if (/\bmodule\.exports\b/u.test(body)) {
        throw new Error(
            `${relativePath}: an unrecognised export survived bundling`
        );
    }
}

export function stripModuleSyntax(source, relativePath, seenModules, root) {
    const requires = [];
    const withoutRequires = source.replace(
        REQUIRE_PATTERN,
        (...args) => {
            requires.push(args.at(-1).target);

            return "";
        }
    );
    const body = withoutRequires
        .replace(USE_STRICT_PATTERN, "")
        .replace(EXPORTS_PATTERN, "");

    assertBundled(relativePath, requires, seenModules, root);
    assertStripped(relativePath, body);

    return body.trim();
}

/*
 * The bundle shares one scope, so two modules declaring the same top-level
 * name would silently collide or fail to parse.
 */
export function recordDeclarations(body, relativePath, declarations) {
    for (const match of body.matchAll(TOP_LEVEL_DECLARATION)) {
        const { name } = match.groups;

        if (declarations.has(name)) {
            throw new Error(
                `duplicate top-level declaration "${name}" in ` +
                `${relativePath} and ${declarations.get(name)}; ` +
                "the bundle shares one scope"
            );
        }

        declarations.set(name, relativePath);
    }
}
