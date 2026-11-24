/* Compare the files already in the checkout with a fresh build in memory. */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { manifestPath, renderManifest, renderArtifacts } from "./release.mjs";

const artifacts = await renderArtifacts();
const dist = path.dirname(manifestPath);
const expected = [...Object.keys(artifacts), path.basename(manifestPath)].sort();
const found = (await readdir(dist)).sort();
if (JSON.stringify(found) !== JSON.stringify(expected)) { throw new Error(`Unexpected distribution files: ${found.join(", ")}`); }
for (const [name, source] of Object.entries(artifacts)) {
    if (await readFile(path.join(dist, name), "utf8") !== source) {
        throw new Error(`dist/${name} is stale. Run npm run build and commit the result.`);
    }
}
const manifest = renderManifest(artifacts);
if (await readFile(manifestPath, "utf8") !== manifest) { throw new Error("dist checksum manifest is stale"); }
process.stdout.write(manifest);
