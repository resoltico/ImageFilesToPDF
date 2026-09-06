import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
    artifactName,
    artifactPath,
    digestOf,
    manifestPath,
    renderManifest,
    renderRelease
} from "./release.mjs";
import { root } from "./repository.mjs";

const release = await renderRelease();
await mkdir(path.join(root, "dist"), { recursive: true });
await writeFile(artifactPath, release, "utf8");

const digest = digestOf(release);
await writeFile(manifestPath, renderManifest(digest), "utf8");
console.log(`${digest}  dist/${artifactName}`);
