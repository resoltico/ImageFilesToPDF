import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { FINDER_JAVASCRIPTCORE } from "./finder-floor.mjs";

// Compile the Finder client for the JavaScriptCore of the macOS floor.
// Built-in availability is checked separately; this target supplies no polyfills.
export const BUNDLE_OPTIONS = {
    bundle: true,
    platform: "neutral",
    format: "iife",
    globalName: "ImageFilesToPDF",
    target: FINDER_JAVASCRIPTCORE,
    minifyWhitespace: true,
    minifyIdentifiers: false,
    legalComments: "none",
    write: false,
    metafile: true
};

/*
 * src/core/product.js reads the product's identity from package.json. A bundle
 * carries only those fields, so a development change to the manifest, such as a
 * dependency bump, does not change what ships.
 */
function manifestProjection(base) {
    const manifest = path.join(base, "package.json");
    return {
        name: "product-manifest",
        setup(bundler) {
            // eslint-disable-next-line require-unicode-regexp -- esbuild filters are Go regular expressions, which take no u flag.
            bundler.onLoad({ filter: /package\.json$/ }, async (args) => {
                if (path.resolve(args.path) !== manifest) { return undefined; }
                const { name, version, homepage, engines } = JSON.parse(await readFile(manifest, "utf8"));
                return { contents: JSON.stringify({ name, version, homepage, engines: { node: engines.node } }), loader: "json" };
            });
        }
    };
}

function compiledGraph(result, base) {
    const normalize = (file) => file.startsWith("<") || file.startsWith("node:") ? file
        : path.relative(base, path.resolve(base, file)).split(path.sep).join("/");
    const files = Object.entries(result.metafile.inputs);
    return {
        inputs: files.map(([file]) => normalize(file)),
        edges: files.flatMap(([file, facts]) => facts.imports.map(({ path: target }) =>
            ({ from: normalize(file), to: normalize(target) })))
    };
}

export async function scopedBundle(entry, base, define = {}) {
    const result = await build({
        ...BUNDLE_OPTIONS,
        absWorkingDir: base,
        define,
        plugins: [manifestProjection(base)],
        entryPoints: [entry]
    });
    const outputs = Object.values(result.metafile.outputs);
    if (outputs.some((output) => output.imports.length > 0)) {
        throw new Error("external runtime dependency in bundle");
    }
    return {
        source: `${result.outputFiles[0].text
            }\nfunction run(input, parameters) { return ImageFilesToPDF.run(input, parameters); }\n`,
        ...compiledGraph(result, base)
    };
}

export async function nodeBundle(entry, base, minimumNode) {
    const result = await build({
        ...BUNDLE_OPTIONS,
        platform: "node",
        format: "cjs",
        globalName: undefined,
        target: `node${minimumNode}`,
        absWorkingDir: base,
        plugins: [manifestProjection(base)],
        entryPoints: [entry]
    });
    for (const output of Object.values(result.metafile.outputs)) {
        if (output.imports.some(({ path: name }) => !name.startsWith("node:"))) {
            throw new Error("external runtime dependency in Node bundle");
        }
    }
    return { source: result.outputFiles[0].text, ...compiledGraph(result, base) };
}
