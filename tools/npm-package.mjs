/*
 * The npm package of the command-line interface.
 *
 * package.json is the private development manifest and owns the name, version,
 * licence, author, addresses and Node floor. The publish manifest is derived
 * from it here, so nothing in the package is maintained by hand, and the
 * package is assembled from committed files at pack time instead of keeping a
 * second copy of the CLI artifact in the checkout.
 *
 * Usage: node tools/npm-package.mjs <output-directory>
 * Prints the path of the packed tarball.
 */
import { execFileSync } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nodeArtifactName, nodeArtifactPath } from "./release.mjs";
import { root } from "./repository.mjs";

const JSON_INDENT = 2;
const USER_ARGUMENT_START = 2;

// Files the package carries besides its manifest; npm adds README and LICENSE itself.
export const PACKAGE_FILES = Object.freeze([nodeArtifactName, "LICENSE", "README.md"]);

export function renderPackageManifest(development) {
    return {
        name: development.name,
        version: development.version,
        description: development.description,
        license: development.license,
        author: development.author,
        homepage: development.homepage,
        repository: development.repository,
        bugs: { url: `${development.homepage}/issues` },
        bin: { [development.name]: nodeArtifactName },
        files: [nodeArtifactName],
        engines: { node: development.engines.node }
    };
}

export async function stagePackage(directory, base = root) {
    const development = JSON.parse(await readFile(path.join(base, "package.json"), "utf8"));
    const manifest = renderPackageManifest(development);
    await writeFile(path.join(directory, "package.json"), `${JSON.stringify(manifest, null, JSON_INDENT)}\n`, "utf8");
    await copyFile(nodeArtifactPath, path.join(directory, nodeArtifactName));
    await copyFile(path.join(base, "LICENSE"), path.join(directory, "LICENSE"));
    await copyFile(path.join(base, "README.md"), path.join(directory, "README.md"));
    return manifest;
}

/** npm pack writes fixed timestamps, so the same inputs and npm version give the same bytes. */
export async function packPackage(destination, { dryRun = false } = {}) {
    const staging = await mkdtemp(path.join(os.tmpdir(), "iftp-npm-package-"));
    try {
        const manifest = await stagePackage(staging);
        const args = ["pack", "--json", "--ignore-scripts", `--pack-destination=${destination}`, ...(dryRun ? ["--dry-run"] : [])];
        // npm 12 (the repository pin) keys the report by package name.
        const report = JSON.parse(execFileSync("npm", args, { cwd: staging, encoding: "utf8" }))[manifest.name];
        return { report, tarball: path.join(destination, report.filename) };
    } finally {
        await rm(staging, { recursive: true, force: true });
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const [destination] = process.argv.slice(USER_ARGUMENT_START);
    if (!destination) { throw new Error("Usage: node tools/npm-package.mjs <output-directory>"); }
    const { tarball } = await packPackage(path.resolve(destination));
    process.stdout.write(`${tarball}\n`);
}
