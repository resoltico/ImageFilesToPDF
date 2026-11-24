import * as acorn from "acorn";

/*
 * The one place this repository parses JavaScript.
 *
 * Every acorn call lives here, so what the build considers a comment, a token
 * or the same program is decided once. The ECMAScript version is a parameter
 * rather than a constant: the floor the artifact is held to is declared in
 * release.mjs, and a copy of it here would be free to disagree.
 *
 * JXA is a classic script because osascript calls run() by name. Repository
 * gates also inspect the imports in Node tooling modules.
 */

const parseOptions = (ecmaVersion) => ({ ecmaVersion, sourceType: "script" });

/*
 * The syntax tree, with every node carrying the byte range it came from, so a
 * caller can remove a statement without reprinting anything.
 */
export function parseScript(source, ecmaVersion, sourceType = "script") {
    return acorn.parse(source, { ...parseOptions(ecmaVersion), sourceType });
}

export function commentsIn(source, ecmaVersion) {
    const comments = [];

    acorn.parse(source, {
        ...parseOptions(ecmaVersion),
        onComment: (block, text, start, end) => comments.push({ text, start, end })
    });

    return comments;
}

export function* syntaxNodes(value) {
    if (value && typeof value === "object") {
        if (value.type) { yield value; }
        for (const child of Object.values(value)) { yield* syntaxNodes(child); }
    }
}
