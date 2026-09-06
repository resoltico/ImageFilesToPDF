/*
 * The header of the released artifact.
 *
 * The artifact leaves the repository: it is pasted into a Shortcuts action and
 * travels with whoever exports that. This is the only place it can say what it
 * is, whose it is, and where it came from -- which matters twice over, because
 * the build is attested on GitHub and a file that does not name its repository
 * cannot be checked against that attestation.
 *
 * Nothing here is typed twice. The version and the URL come from package.json,
 * the copyright line from LICENSE, and the macOS floor from release.mjs, so a
 * banner that disagrees with the repository is not something anyone has to
 * notice.
 */

const COPYRIGHT = /^Copyright \(c\) (?<value>.+)$/mu;

export function copyrightFrom(license) {
    const match = COPYRIGHT.exec(license);

    if (!match) {
        throw new Error("LICENSE no longer carries a copyright line to quote");
    }

    return match.groups.value.trim();
}

/*
 * Everything the banner says about this repository, gathered from the files
 * that already state it. The reader is a parameter: what the banner is made
 * of can then be asserted against a fixture rather than against the tree.
 */
export async function readMetadata(read, minimumMacos) {
    const packageJson = JSON.parse(await read("package.json"));

    return {
        version: packageJson.version,
        homepage: packageJson.homepage,
        license: packageJson.license,
        copyright: copyrightFrom(await read("LICENSE")),
        minimumMacos
    };
}

/*
 * SPDX rather than the full notice: an identifier is unambiguous, machine
 * readable, and one line, and the text it names is a click away at a URL the
 * banner already carries.
 */
export function renderBanner(meta) {
    return `/*
 * Image Files to PDF ${meta.version}
 * ${meta.homepage}
 *
 * Copyright (c) ${meta.copyright}
 * SPDX-License-Identifier: ${meta.license}
 *
 * Generated file. Edit the sources and rebuild; changes made to this copy are
 * overwritten and are not covered by any test. Comments are stripped on build:
 * the sources they came from are at the address above.
 *
 * Requires macOS ${meta.minimumMacos} or later, and the command-line tools:
 *     brew install vips pdfcpu
 */`;
}
