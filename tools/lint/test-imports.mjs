import { lstat, readFile, realpath } from "node:fs/promises";
import { isBuiltin } from "node:module";
import path from "node:path";
import { parseScript, syntaxNodes } from "../javascript.mjs";
import { root } from "../repository.mjs";
import { walk } from "./discovery.mjs";

function importTarget(node) {
    if (["ImportExpression", "ImportDeclaration", "ExportNamedDeclaration", "ExportAllDeclaration"].includes(node.type)) {
        return node.source;
    }
    if (node.type !== "CallExpression") { return null; }
    const { callee } = node;
    if (callee.name === "require" || (callee.object?.name === "require" && callee.property?.name === "resolve")) {
        return node.arguments[0] ?? {};
    }
    return null;
}

function permittedPath(file) {
    return /^(?:src\/|tests\/unit\/(?:ports\/|(?:[^/]+\/)*fixture[^/]*$)|tests\/integration\/lib\/)/u.test(file);
}

async function checkModule(test, node, base, dependencies) {
    if (node.type !== "Literal" || typeof node.value !== "string") {
        throw new Error(`${test}: test module imports must use literal paths`);
    }
    const name = node.value;
    const [packageName] = /^(?:@[^/]+\/)?[^/]+/u.exec(name) ?? [];
    if (isBuiltin(name) || dependencies.has(packageName)) { return; }
    if (name.startsWith("./") || name.startsWith("../")) {
        const target = path.posix.normalize(path.posix.join(path.posix.dirname(test), name));
        if (permittedPath(target)) {
            const resolved = path.relative(base, await realpath(path.join(base, target))).split(path.sep).join("/");
            if (permittedPath(resolved)) { return; }
        }
    }
    throw new Error(`${test}: forbidden test import ${name}`);
}

export async function checkTestImports(base = root) {
    const canonicalBase = await realpath(base);
    const support = await lstat(path.join(base, "tests/support")).catch((error) => {
        if (error.code === "ENOENT") { return undefined; }
        throw error;
    });
    if (support) { throw new Error("tests/support must be absent"); }
    const { devDependencies } = JSON.parse(await readFile(path.join(base, "package.json"), "utf8"));
    const packages = new Set(Object.keys(devDependencies));
    for (const test of await walk("tests", base)) {
        const source = await readFile(path.join(base, test), "utf8");
        const syntax = parseScript(source, "latest", test.endsWith(".mjs") ? "module" : "script");
        for (const node of syntaxNodes(syntax)) {
            const target = importTarget(node);
            if (target) { await checkModule(test, target, canonicalBase, packages); }
        }
    }
}
