import { isBuiltin } from "node:module";

const LAYERS = {
    core: ["core"],
    backend: ["core", "backend"],
    application: ["core", "application", "backend"],
    engine: ["core", "backend", "application", "engine"],
    cli: ["core", "engine", "cli"],
    serve: ["core", "engine", "serve"],
    finder: ["core", "finder"],
    entry: ["finder"]
};
const NATIVE_LAYERS = new Set(["engine", "cli", "serve", "finder"]);
// The product's identity is read from the manifest that owns it, by one module.
export const MANIFEST = "package.json";
const MANIFEST_READER = "src/core/product.js";

function layerOf(file) {
    if (file === "src/entry.js") { return "entry"; }
    return file.split("/")[1];
}

function sourceLayer(file) {
    const layer = layerOf(file);
    if (!Object.hasOwn(LAYERS, layer)) { throw new Error(`${file}: unknown source layer`); }
    return layer;
}

export function allowsHostGlobals(file) {
    return NATIVE_LAYERS.has(sourceLayer(file));
}

function finderInterface(file) {
    return /^src\/finder\/(?<name>quick-action)\//u.exec(file)?.groups.name;
}

export function checkDependency(file, target) {
    const layer = sourceLayer(file);
    if (target === MANIFEST) {
        if (file !== MANIFEST_READER) { throw new Error(`${file}: only ${MANIFEST_READER} reads ${MANIFEST}`); }
    } else if (target.startsWith("src/")) {
        if (layer === "finder" && finderInterface(target) && finderInterface(file) !== finderInterface(target)) {
            throw new Error(`${file}: forbidden Finder interface dependency ${target}`);
        }
        if (!LAYERS[layer].includes(layerOf(target))) { throw new Error(`${file}: forbidden dependency ${target}`); }
    } else if (!(["engine", "cli", "serve"].includes(layer) && target.startsWith("node:") && isBuiltin(target))) {
        throw new Error(`${file}: external dependency ${target}`);
    }
}

export function checkCompiledDependencies(edges, embeddedSource) {
    for (const { from, to } of edges) {
        // esbuild represents the embedded engine text as a generated input.
        if (to !== embeddedSource) { checkDependency(from, to); }
    }
}
