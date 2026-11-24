import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseScript, syntaxNodes } from "../javascript.mjs";

// These executable entry points consume source outside the shipped bundles.
const TOOL_ENTRIES = [
    "tools/check-pdfcpu.mjs",
    "tools/lint/settings-docs.mjs",
    "tools/node-boot.mjs",
    "tools/release.mjs",
    "tests/integration/form-probe.js"
];
const FINDER_ENTRY = "src/entry.js:run";
const keyOf = (file, symbol) => `${file}:${symbol}`;
const nameOf = (node) => node.name ?? node.value;

function moduleExports(target) {
    return target?.object?.name === "module" && target.property?.name === "exports";
}

function exportKeys(nodes) {
    return nodes.flatMap((node) => {
        if (node.type !== "AssignmentExpression") { return []; }
        const target = node.left;
        if (target.object?.name === "exports" || moduleExports(target.object)) { return [nameOf(target.property)]; }
        if (!moduleExports(target)) { return []; }
        if (node.right.type !== "ObjectExpression") { throw new Error("Production exports must be declared as an object"); }
        return node.right.properties.map(({ key }) => nameOf(key));
    });
}

function recordMembers(nodes, namespace, accept) {
    for (const node of nodes) {
        if (node.type === "VariableDeclarator" && node.init?.name === namespace && node.id.type === "ObjectPattern") {
            for (const { key } of node.id.properties) { accept(nameOf(key)); }
        } else if (node.type === "MemberExpression" && node.object.name === namespace) {
            accept(nameOf(node.property));
        }
    }
}

function recordBindings(nodes, specifiers, accept) {
    for (const specifier of specifiers) {
        if (specifier.type === "ImportSpecifier") { accept(nameOf(specifier.imported)); }
        else { recordMembers(nodes, specifier.local.name, accept); }
    }
}

function requestedModule(node) {
    if (node.type === "ImportDeclaration") { return node.source.value; }
    const call = node.type === "MemberExpression" ? node.object : node.type === "VariableDeclarator" && node.init;
    return call?.callee?.name === "require" ? call.arguments[0]?.value : null;
}

function recordImports(file, nodes, sources, used) {
    for (const node of nodes) {
        const name = requestedModule(node);
        if (typeof name === "string" && name.startsWith(".")) {
            const target = path.posix.join(path.posix.dirname(file), name);
            if (sources.has(target) && target !== file) {
                const accept = (symbol) => used.add(keyOf(target, symbol));
                if (node.type === "ImportDeclaration") { recordBindings(nodes, node.specifiers, accept); }
                else if (node.type === "MemberExpression") { accept(nameOf(node.property)); }
                else if (node.id.type === "ObjectPattern") { node.id.properties.map(({ key }) => nameOf(key)).forEach(accept); }
                else { recordMembers(nodes, node.id.name, accept); }
            }
        }
    }
}

export function checkProductionExports(sources, consumers = new Map()) {
    const used = new Set([FINDER_ENTRY]);
    const declarations = [];
    for (const [file, source] of [...sources, ...consumers]) {
        const nodes = [...syntaxNodes(parseScript(source, "latest", file.endsWith(".mjs") ? "module" : "script"))];
        if (sources.has(file)) { declarations.push(...exportKeys(nodes).map((name) => keyOf(file, name))); }
        recordImports(file, nodes, sources, used);
    }
    const unused = declarations.filter((entry) => !used.has(entry));
    if (unused.length > 0) { throw new Error(`Unused production exports: ${unused.join(", ")}`); }
}

export async function checkExportConsumers(sources) {
    const consumers = await Promise.all(TOOL_ENTRIES.map(async (file) => [file, await readFile(file, "utf8")]));
    checkProductionExports(sources, new Map(consumers));
}
