import { readFile } from "node:fs/promises";
import path from "node:path";
import { root } from "../repository.mjs";

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
        )
    ]);
}

// The Node floor as package.json declares it: exactly ">=x.y.z", which src/core/product.js reads.
function nodeFloor(packageJson) {
    const match = /^>=(?<value>\d+\.\d+\.\d+)$/u.exec(packageJson.engines?.node ?? "");
    if (!match) { throw new Error(`package.json engines.node must be ">=x.y.z", not ${JSON.stringify(packageJson.engines?.node)}`); }
    return match.groups.value;
}

const LINUX_IMAGE = "tests/integration/linux-native.Dockerfile";
const WINDOWS_TOOLS = "tests/integration/windows-tools.ps1";

/*
 * CI tests on the floors it promises: the Node it runs, everywhere, is the
 * oldest Node the product supports, so the floor is exercised rather than
 * assumed. Raising one means raising the other.
 */
export async function checkNodeVersion(read = readFromDisk) {
    const packageJson = JSON.parse(await read("package.json"));

    return assertAll("Node versions", [
        [".node-version", (await read(".node-version")).trim()],
        extract(
            await read("mise.toml"),
            /node = "(?<value>[\d.]+)"/u,
            "mise.toml"
        ),
        extract(await read(LINUX_IMAGE), /^FROM node:(?<value>[\d.]+)-/mu, LINUX_IMAGE),
        ["package.json engines", nodeFloor(packageJson)]
    ]);
}

// The npm contributors use: packageManager pins it, and engines holds installs to it.
export async function checkNpmVersion(read = readFromDisk) {
    const packageJson = JSON.parse(await read("package.json"));
    return assertAll("npm versions", [
        ["package.json packageManager", String(packageJson.packageManager).replace(/^npm@/u, "")],
        ["package.json engines.npm", String(packageJson.engines?.npm).replace(/^>=/u, "")]
    ]);
}

function allMatches(text, pattern, where) {
    const found = [...text.matchAll(pattern)].map((match) => [where, match.groups.value]);
    if (found.length === 0) { throw new Error(`could not find the declared value in ${where}`); }
    return found;
}

// Linux and Windows CI install exactly the oldest pdfcpu the product accepts; macOS CI takes Homebrew's.
export async function checkPdfcpuVersion(read = readFromDisk) {
    const download = /pdfcpu\/releases\/download\/v(?<value>[\d.]+)\//gu;
    return assertAll("pdfcpu versions", [
        extract(await read("src/core/setup.js"), /const MINIMUM_PDFCPU_VERSION = "(?<value>[\d.]+)"/u, "src/core/setup.js"),
        ...allMatches(await read(LINUX_IMAGE), download, LINUX_IMAGE),
        ...allMatches(await read(WINDOWS_TOOLS), download, WINDOWS_TOOLS)
    ]);
}

/*
 * The documents a person follows state the floors in prose, and a stale floor
 * there is the one they act on. Each claim must equal its owner. A pattern
 * that matches nothing fails too, so rewording a document cannot quietly turn
 * the check off. Measurements, such as the host a QA result came from, are not
 * claims, and the patterns do not match them.
 */
const FLOOR_DOCUMENTS = ["README.md", "INSTALL.txt", "HEADLESS.md", "QA.md", "CONTRIBUTING.md"];

function unreleased(changelog) {
    const start = changelog.indexOf("## [Unreleased]");
    const end = changelog.indexOf("\n## [", start + 1);
    return start === -1 ? "" : changelog.slice(start, end === -1 ? changelog.length : end);
}

export async function checkStatedFloors(read = readFromDisk) {
    const packageJson = JSON.parse(await read("package.json"));
    const floor = await read("tools/finder-floor.mjs");
    const owners = {
        "Node.js": nodeFloor(packageJson),
        pdfcpu: extract(await read("src/core/setup.js"), /const MINIMUM_PDFCPU_VERSION = "(?<value>[\d.]+)"/u, "src/core/setup.js")[1],
        macOS: extract(floor, /MINIMUM_MACOS = "(?<value>[\d.]+)"/u, "tools/finder-floor.mjs")[1],
        Safari: extract(floor, /FINDER_JAVASCRIPTCORE = "safari(?<value>[\d.]+)"/u, "tools/finder-floor.mjs")[1]
    };
    const claims = {
        "Node.js": [/Node\.js (?<value>\d+\.\d+\.\d+)(?: or (?:later|newer)|\+)/gu, /the (?<value>\d+\.\d+\.\d+) minimum/gu,
            /nodejs\/node\/blob\/v(?<value>\d+\.\d+\.\d+)\//gu, /nodejs\.org\/en\/blog\/release\/v(?<value>\d+\.\d+\.\d+)/gu],
        pdfcpu: [/pdfcpu (?<value>\d+\.\d+\.\d+)(?: or (?:later|newer)|\+)/gu],
        // Two-part macOS versions are floors; hosts are named in full, as macOS 27.2.1.
        macOS: [/macOS (?<value>\d+\.\d+)(?![.\d])/gu],
        Safari: [/Safari (?<value>\d+\.\d+)/gu]
    };
    const texts = [...await Promise.all(FLOOR_DOCUMENTS.map(async (file) => [file, await read(file)])),
        ["CHANGELOG.md (Unreleased)", unreleased(await read("CHANGELOG.md"))]];
    for (const [subject, patterns] of Object.entries(claims)) {
        for (const pattern of patterns) {
            const found = texts.flatMap(([file, text]) => [...text.matchAll(pattern)].map((match) => [file, match.groups.value]));
            if (found.length === 0) { throw new Error(`no document states the ${subject} floor as ${pattern}`); }
            assertAll(`${subject} floors`, [[`the ${subject} floor's owner`, owners[subject]], ...found]);
        }
    }
    return owners;
}

/*
 * A release tag must name the version the repository already agrees on.
 *
 * Reuses checkVersion rather than reading package.json again, so tagging
 * cannot succeed while the files that state the version disagree — the
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

/*
 * Where the product keeps data, as src/core/data-locations.js names it, and
 * as the documents tell people to find or remove it.
 */
export async function checkDataLocations(read = readFromDisk) {
    const owner = await read("src/core/data-locations.js");
    const declared = (name) => extract(owner, new RegExp(`const ${name} = "(?<value>[^"]+)"`, "u"), "src/core/data-locations.js");
    const stated = async (file, pattern) => allMatches(await read(file), pattern, file);
    const domain = /(?:defaults delete |preferences domain `)(?<value>[\w.]+)/gu;
    return [
        assertAll("preferences domains", [declared("PREFERENCES_DOMAIN"), ...await stated("README.md", domain), ...await stated("INSTALL.txt", domain)]),
        assertAll("data folders", [declared("DATA_FOLDER"), ...await stated("QA.md", /(?:Application Support\/|%LOCALAPPDATA%\\)(?<value>[^/\\`]+)[/\\]Workspaces/gu)]),
        assertAll("state folders", [declared("STATE_FOLDER"), ...await stated("QA.md", /state\}\/(?<value>[^/`]+)\/workspaces/gu)])
    ];
}

export async function checkConsistency(read = readFromDisk) {
    const version = await checkVersion(read);
    const node = await checkNodeVersion(read);
    const url = await checkRepositoryUrl(read);
    const npm = await checkNpmVersion(read);
    const pdfcpu = await checkPdfcpuVersion(read);
    const floors = await checkStatedFloors(read);
    await checkDataLocations(read);

    return `version ${version}, node ${node}, npm ${npm}, pdfcpu ${pdfcpu}, macOS ${floors.macOS}+, ${url}`;
}
