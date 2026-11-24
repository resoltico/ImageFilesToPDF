import { build } from "esbuild";
import path from "node:path";

// Keep the Finder client compatible with Safari 15.4 JavaScriptCore.
// Built-in availability is checked separately; this target supplies no polyfills.
export const BUNDLE_OPTIONS = {
    bundle: true,
    platform: "neutral",
    format: "iife",
    globalName: "ImageFilesToPDF",
    target: "safari15.4",
    minifyWhitespace: true,
    minifyIdentifiers: false,
    legalComments: "none",
    write: false,
    metafile: true
};

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
        entryPoints: [entry]
    });
    for (const output of Object.values(result.metafile.outputs)) {
        if (output.imports.some(({ path: name }) => !name.startsWith("node:"))) {
            throw new Error("external runtime dependency in Node bundle");
        }
    }
    return { source: result.outputFiles[0].text, ...compiledGraph(result, base) };
}
