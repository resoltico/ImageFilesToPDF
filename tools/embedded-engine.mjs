import { parseScript } from "./javascript.mjs";

function* syntaxNodes(value) {
    if (!value || typeof value !== "object") { return; }
    if (typeof value.type === "string") { yield value; }
    for (const child of Object.values(value)) { yield* syntaxNodes(child); }
}

export function embeddedEngineIn(text, ecmaVersion) {
    const tree = parseScript(text, ecmaVersion);
    for (const node of syntaxNodes(tree)) {
        if (node.type === "ObjectExpression") {
            const properties = new Map(node.properties.filter((property) => property.value?.type === "Literal")
                .map((property) => [property.key.name ?? property.key.value, property.value]));
            const filename = properties.get("filename");
            const source = properties.get("source");
            if (/^engine-.+\.cjs$/u.test(filename?.value ?? "") && typeof source?.value === "string") {
                return { filename: filename.value, source: source.value, start: source.start, end: source.end };
            }
        }
    }
    return null;
}
