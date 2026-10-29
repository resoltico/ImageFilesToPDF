/* Build-only metadata and standalone artifact rendering. */
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { renderBanner, readMetadata } from "./banner.mjs";
import { scopedBundle } from "./scoped-bundle.mjs";
import { root } from "./repository.mjs";

export const MINIMUM_MACOS = "12.3";
export const ECMASCRIPT_TARGET = 2022;
export const artifactName = "Image-Files-to-PDF.jxa";
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

export async function renderRelease() {
    const banner = renderBanner(await readMetadata(
        (relative) => readFile(path.join(root, relative), "utf8"), MINIMUM_MACOS
    ));
    const bundle = await scopedBundle("src/entry.js", root);
    assertSourceDiscovery(await sourceFiles(), bundle.inputs);
    return `${banner}\n\n${bundle.source}`;
}

export function digestOf(release) {
    return createHash("sha256").update(release).digest("hex");
}

export function renderManifest(digest) {
    return `${digest}  ${artifactName}\n`;
}
