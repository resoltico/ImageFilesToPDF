import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { manifestPath, renderManifest, renderArtifacts } from "./release.mjs";
import { root } from "./repository.mjs";

const artifacts = await renderArtifacts();
const dist = path.join(root, "dist");
await mkdir(dist, { recursive: true });
for (const [name, source] of Object.entries(artifacts)) {
    await writeFile(path.join(dist, name), source, "utf8");
}
const manifest = renderManifest(artifacts);
await writeFile(manifestPath, manifest, "utf8");
process.stdout.write(manifest);
