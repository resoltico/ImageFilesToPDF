import { readFile } from "node:fs/promises";
import path from "node:path";
import { root } from "../release.mjs";

/*
 * Facts that are stated in more than one file must agree.
 *
 * Each of these was previously duplicated with nothing checking it, so they
 * agreed by luck rather than by construction.
 */

export async function readFromDisk(relative) {
    try {
        return await readFile(path.join(root, relative), "utf8");
    } catch {
        throw new Error(
            `${relative} is missing, and the gate checks it for the version or ` +
            "the Node pin. If it was renamed, update tools/lint/consistency.mjs " +
            "as well; INSTALL.txt in particular is deliberately plain text."
        );
    }
}

export function assertAll(label, found) {
    const distinct = [...new Set(found.map(([, value]) => value))];

    if (distinct.length > 1) {
        const detail = found
            .map(([where, value]) => `  ${where}: ${value}`)
            .join("\n");

        throw new Error(`${label} disagree between files:\n${detail}`);
    }

    return distinct[0];
}

export function extract(text, pattern, where) {
    const match = pattern.exec(text);

    if (!match) {
        throw new Error(`could not find the declared value in ${where}`);
    }

    return [where, match.groups.value];
}

export async function checkVersion(read = readFromDisk) {
    const packageJson = JSON.parse(await read("package.json"));
    const lock = JSON.parse(await read("package-lock.json"));

    return assertAll("versions", [
        ["package.json", packageJson.version],
        ["package-lock.json", lock.version],
        ["package-lock.json (root package)", lock.packages[""].version],
        extract(
            await read("INSTALL.txt"),
            /IMAGE FILES TO PDF (?<value>\d+\.\d+\.\d+)/u,
            "INSTALL.txt"
        ),
        extract(
            await read("CHANGELOG.md"),
            /^## \[(?<value>\d+\.\d+\.\d+)\]/mu,
            "CHANGELOG.md (newest entry)"
        ),
        extract(
            await read("src/core/version.js"),
            /const VERSION = "(?<value>\d+\.\d+\.\d+)"/u,
            "src/core/version.js"
        )
    ]);
}

export async function checkNodeVersion(read = readFromDisk) {
    const packageJson = JSON.parse(await read("package.json"));

    return assertAll("Node versions", [
        [".node-version", (await read(".node-version")).trim()],
        extract(
            await read("mise.toml"),
            /node = "(?<value>[\d.]+)"/u,
            "mise.toml"
        ),
        ["package.json engines", packageJson.engines.node.replace(/^>=/u, "")]
    ]);
}

/*
 * A release tag must name the version the repository already agrees on.
 *
 * Reuses checkVersion rather than reading package.json again, so tagging
 * cannot succeed while the six files that state the version disagree — the
 * tag is checked against the agreed value, not against one opinion of it.
 */
export async function checkReleaseTag(tag, read = readFromDisk) {
    const version = await checkVersion(read);
    const expected = `v${version}`;

    if (tag !== expected) {
        throw new Error(
            `release tag ${tag} does not match the declared version: ` +
            `expected ${expected}`
        );
    }

    return version;
}

/*
 * The CHANGELOG section for one version, for a release body.
 *
 * Taken from the CHANGELOG rather than from a per-tag notes file, because a
 * second copy of the same prose is a second thing to keep in agreement, and
 * this repository has been bitten by exactly that before.
 */
/*
 * The one address the artifact carries out of this repository.
 *
 * The banner is generated from package.json, so it cannot drift on its own --
 * but the documents a user reads state the same address in prose, and a stale
 * URL in the file someone follows is worse than none. package.json declares it
 * in two forms as npm requires, and both are compared here in the plain one.
 */
const PROJECT_URL =
    /(?<value>https:\/\/github\.com\/[\w.-]+\/[\w.-]+)/u;

const asBrowsableUrl = (declared) => String(declared)
    .replace(/^git\+/u, "")
    .replace(/\.git$/u, "");

export async function checkRepositoryUrl(read = readFromDisk) {
    const packageJson = JSON.parse(await read("package.json"));

    return assertAll("repository URLs", [
        ["package.json homepage", packageJson.homepage],
        ["package.json repository", asBrowsableUrl(packageJson.repository.url)],
        extract(await read("README.md"), PROJECT_URL, "README.md"),
        extract(await read("INSTALL.txt"), PROJECT_URL, "INSTALL.txt")
    ]);
}

export async function checkConsistency(read = readFromDisk) {
    const version = await checkVersion(read);
    const node = await checkNodeVersion(read);
    const url = await checkRepositoryUrl(read);

    return `version ${version}, node ${node}, ${url}`;
}
