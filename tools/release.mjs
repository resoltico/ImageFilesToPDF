/* Build-only metadata and standalone artifact rendering. */
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { renderBanner, readMetadata } from "./banner.mjs";
import { scopedBundle, nodeBundle } from "./scoped-bundle.mjs";
import { root } from "./repository.mjs";
import runtime from "../src/engine/runtime.js";

const HASH_PREFIX_LENGTH = 12;
const ENGINE_DEFINE = "globalThis.iftpEmbeddedEngine";

export const MINIMUM_MACOS = "13.5";
export const ECMASCRIPT_TARGET = 2022;
export const artifactName = "Image-Files-to-PDF.jxa";
export const nodeArtifactName = "Image-Files-to-PDF.cjs";
export const nodeArtifactPath = path.join(root, "dist", nodeArtifactName);
export const artifactPath = path.join(root, "dist", artifactName);
export const manifestPath = path.join(root, "dist", "SHA256SUMS");

export async function sourceFiles(directory = "src", base = root) {
    const entries = await readdir(path.join(base, directory), { withFileTypes: true });
    const found = await Promise.all(entries.map((entry) => entry.isDirectory()
        ? sourceFiles(`${directory}/${entry.name}`, base)
        : [`${directory}/${entry.name}`]));
    return found.flat().filter((file) => file.endsWith(".js")).sort();
}

export function assertSourceDiscovery(files, inputs) {
    const omitted = files.filter((file) => !inputs.includes(file));
    if (omitted.length > 0) {
        throw new Error(`unbundled source: ${omitted.join(", ")}`);
    }
}

export async function renderArtifacts() {
    const [meta, node, engine] = await Promise.all([
        readMetadata((relative) => readFile(path.join(root, relative), "utf8"), MINIMUM_MACOS),
        nodeBundle("src/cli/entry.js", root, runtime.MINIMUM_NODE_VERSION),
        nodeBundle("src/serve/entry.js", root, runtime.MINIMUM_NODE_VERSION)
    ]);
    const engineBundle = { filename: `engine-${meta.version}-${createHash("sha256").update(engine.source).digest("hex").slice(0, HASH_PREFIX_LENGTH)}.cjs`, source: engine.source };
    const jxa = await scopedBundle("src/entry.js", root, { [ENGINE_DEFINE]: JSON.stringify(engineBundle) });
    assertSourceDiscovery(await sourceFiles(), [...jxa.inputs, ...node.inputs, ...engine.inputs]);
    if (jxa.inputs.some((file) => !file.startsWith("src/core/") && !file.startsWith("src/host/") && file !== "src/entry.js" && file !== `<define:${ENGINE_DEFINE}>`) ||
        [...node.inputs, ...engine.inputs].some((file) => file.startsWith("src/host/") || file === "src/entry.js") ||
        node.inputs.some((file) => file.startsWith("src/serve/")) || engine.inputs.includes("src/cli/entry.js")) {
        throw new Error("an artifact includes the other runtime's adapter");
    }
    const finderRuntime = `Requires macOS ${meta.minimumMacos} or later, Node.js 26 or later, libvips and pdfcpu.\n *     brew install node vips pdfcpu`;
    return {
        [artifactName]: `${renderBanner(meta, finderRuntime)}\n\n${jxa.source}`,
        [nodeArtifactName]: `${renderBanner(meta, `Requires Node.js ${runtime.MINIMUM_NODE_VERSION} or later, libvips and pdfcpu. See HEADLESS.md for setup.`)}\n\n${node.source}`
    };
}

export async function renderRelease() { return (await renderArtifacts())[artifactName]; }

export function digestOf(release) {
    return createHash("sha256").update(release).digest("hex");
}

export function renderManifest(artifacts) {
    return Object.entries(artifacts).map(([name, source]) => `${digestOf(source)}  ${name}\n`).join("");
}
