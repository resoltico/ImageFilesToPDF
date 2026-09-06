import { assertAll, readFromDisk } from "./consistency.mjs";

/*
 * The Homebrew command that installs the integration toolchain, and the
 * commands that suite actually requires.
 *
 * Both halves earned their place. The install command is written out in four
 * places — twice in CONTRIBUTING.md and once in each workflow — with nothing
 * to stop them drifting apart. And `tiffcp` was required by the suite while
 * being named by none of them: it worked only because vips happens to depend
 * on libtiff, so the documented install would have been one upstream change
 * away from failing on a machine that followed it exactly.
 */

const INSTALL_SOURCES = [
    "CONTRIBUTING.md",
    ".github/workflows/quality.yml",
    ".github/workflows/release.yml"
];

const INSTALL = /brew install (?<value>[^\n`]+)/gu;
const REQUIRED_TOOLS = /for tool in (?<value>[^;]+); do/u;

/*
 * Which formula provides each command. A command is not a formula: poppler
 * provides two of these under different names, vips provides two, and libtiff
 * provides the one that went missing.
 */
const PROVIDED_BY = {
    vips: "vips",
    vipsheader: "vips",
    pdfcpu: "pdfcpu",
    qpdf: "qpdf",
    pdfinfo: "poppler",
    pdftoppm: "poppler",
    tiffcp: "libtiff"
};

// Ships with macOS, so no formula installs it.
const PREINSTALLED = new Set(["osascript"]);

export function formulaFor(tool, provided = PROVIDED_BY) {
    if (PREINSTALLED.has(tool)) {
        return "";
    }

    if (!Object.hasOwn(provided, tool)) {
        throw new Error(
            `the integration suite requires ${tool}, and nothing records ` +
            "which formula provides it; add it to PROVIDED_BY"
        );
    }

    const formula = provided[tool];

    // A blank mapping and a command that ships with macOS are different
    // things, and sharing one representation would let the first pass as the
    // second — silently exempting a tool from the check, which is how tiffcp
    // came to be required by the suite and installed by nothing.
    if (formula === "") {
        throw new Error(
            `${tool} is mapped to no formula; if it ships with macOS it ` +
            "belongs in PREINSTALLED, and otherwise it needs a formula"
        );
    }

    return formula;
}

export function missingFormulae(installed, tools) {
    const present = new Set(installed);

    return tools
        .map((tool) => formulaFor(tool))
        .filter((formula) => formula !== "" && !present.has(formula));
}

async function installCommands(read) {
    const found = [];

    await Promise.all(INSTALL_SOURCES.map(async (file) => {
        const matches = [...String(await read(file)).matchAll(INSTALL)];

        if (matches.length === 0) {
            throw new Error(`${file} no longer documents the install command`);
        }

        matches.forEach((match, index) => {
            found.push([`${file} (${index + 1})`, match.groups.value.trim()]);
        });
    }));

    return found.sort();
}

export async function checkToolchain(read = readFromDisk) {
    const installed = await assertAll("install commands", await installCommands(read));
    const fixtures = String(await read("tests/integration/lib/fixtures.sh"));
    const required = REQUIRED_TOOLS.exec(fixtures);

    if (!required) {
        throw new Error(
            "tests/integration/lib/fixtures.sh no longer lists its required tools"
        );
    }

    const formulae = installed.split(/\s+/u);
    const missing = missingFormulae(
        formulae,
        required.groups.value.trim().split(/\s+/u)
    );

    if (missing.length > 0) {
        throw new Error(
            "the integration suite requires tools the documented install does " +
            `not provide: ${[...new Set(missing)].join(", ")}`
        );
    }

    return formulae.length;
}
