/* Build-only metadata and standalone artifact rendering. */
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { renderBanner, readMetadata } from "./banner.mjs";
import { scopedBundle, nodeBundle } from "./scoped-bundle.mjs";
import { root } from "./repository.mjs";
import runtime from "../src/node/runtime.js";

export const MINIMUM_MACOS = "12.3";
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
    const [meta, jxa, node] = await Promise.all([
        readMetadata((relative) => readFile(path.join(root, relative), "utf8"), MINIMUM_MACOS),
        scopedBundle("src/entry.js", root),
        nodeBundle("src/node/entry.js", root, runtime.MINIMUM_NODE_VERSION)
    ]);
    assertSourceDiscovery(await sourceFiles(), [...jxa.inputs, ...node.inputs]);
    if (jxa.inputs.some((file) => file.startsWith("src/node/")) ||
        node.inputs.some((file) => file.startsWith("src/host/") || file === "src/entry.js")) {
        throw new Error("an artifact includes the other runtime's adapter");
    }
    return {
        [artifactName]: `${renderBanner(meta)}\n\n${jxa.source}`,
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
