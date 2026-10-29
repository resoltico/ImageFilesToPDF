import { build } from "esbuild";
import path from "node:path";

// Safari 15.4 is the JavaScriptCore shipped by the supported macOS 12.3 floor.
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

export async function scopedBundle(entry, base) {
    const result = await build({
        ...BUNDLE_OPTIONS,
        absWorkingDir: base,
        entryPoints: [entry]
    });
    const outputs = Object.values(result.metafile.outputs);
    if (outputs.some((output) => output.imports.length > 0)) {
        throw new Error("external runtime dependency in bundle");
    }
    const inputs = Object.keys(result.metafile.inputs).map((name) =>
        path.relative(base, path.resolve(base, name)).split(path.sep).join("/"));
    return {
        source: `${result.outputFiles[0].text
            }\nfunction run(input, parameters) { return ImageFilesToPDF.run(input, parameters); }\n`,
        inputs
    };
}
