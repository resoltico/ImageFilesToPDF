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
import { parseScript } from "./javascript.mjs";
import { exciseRanges } from "./excise.mjs";
import { moduleSyntaxIn, declaredNames } from "./commonjs.mjs";

/*
 * The comment that says which source module the code below came from.
 *
 * Produced here and named here, so the strip step can be told exactly which
 * comments to keep rather than recognising them by their shape. A shape has to
 * be described twice and can be changed on one side only; the text itself
 * cannot.
 */
function sectionTextFor(relativePath) {
    return ` ===== ${relativePath} ===== `;
}

export function sectionMarkerFor(relativePath) {
    return `/*${sectionTextFor(relativePath)}*/`;
}

// What a parser reports as the body of that comment, which is how the strip
// step is told to keep it.
export function markerTextsFor(relativePaths) {
    return new Set(relativePaths.map(sectionTextFor));
}

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

/*
 * The module's own code: its requires, its exports and its strict directive
 * removed, and nothing else touched.
 */
export function stripModuleSyntax(source, relativePath, bundle) {
    const { requires, removed } = moduleSyntaxIn(
        parseScript(source, bundle.ecmaVersion)
    );
    const body = exciseRanges(source, removed);

    assertBundled(relativePath, requires, bundle.seenModules, bundle.root);
    assertStripped(relativePath, body);

    return body.trim();
}

/*
 * The bundle shares one scope, so two modules declaring the same top-level
 * name would silently collide or fail to parse.
 */
export function recordDeclarations(body, relativePath, declarations, ecmaVersion) {
    const names = parseScript(body, ecmaVersion).body.flatMap(declaredNames);

    for (const name of names) {
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
