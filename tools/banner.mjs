/*
 * The header of the released artifact.
 *
 * The artifact leaves the repository: it is pasted into a Shortcuts action and
 * travels with whoever exports that. This is the only place it can say what it
 * is, whose it is, and where it came from -- which matters twice over, because
 * the build is attested on GitHub and a file that does not name its repository
 * cannot be checked against that attestation.
 *
 * Version, URL, license and copyright come from package.json; the macOS floor
 * comes from release.mjs. The generated banner cannot drift from those facts.
 */

/*
 * Everything the banner says about this repository, gathered from the files
 * that already state it. The reader is a parameter: what the banner is made
 * of can then be asserted against a fixture rather than against the tree.
 */
export async function readMetadata(read, minimumMacos) {
    const packageJson = JSON.parse(await read("package.json"));

    if (typeof packageJson.copyright !== "string" || !packageJson.copyright.trim()) {
        throw new Error("package.json no longer carries a copyright notice");
    }
    // The notice below states these terms in words, so it must agree with them.
    if (packageJson.license !== "AGPL-3.0-only") {
        throw new Error("package.json license is not AGPL-3.0-only, which the banner states");
    }

    return {
        version: packageJson.version,
        homepage: packageJson.homepage,
        license: packageJson.license,
        copyright: packageJson.copyright.trim(),
        minimumMacos
    };
}

/*
 * The standalone artifact retains the AGPL notice and the source location for
 * its version even when copied without the repository or release assets.
 */
export function renderBanner(meta) {
    return `/*
 * Image Files to PDF ${meta.version}
 * ${meta.homepage}
 *
 * Copyright (c) ${meta.copyright}
 * SPDX-License-Identifier: ${meta.license}
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License, version 3 only,
 * as published by the Free Software Foundation. It is distributed WITHOUT ANY
 * WARRANTY; see the license for details:
 * https://www.gnu.org/licenses/agpl-3.0.html
 * Corresponding Source: ${meta.homepage}/tree/v${meta.version}
 *
 * Generated file. Edit the sources and rebuild; changes made to this copy are
 * overwritten and are not covered by any test. Comments are stripped on build:
 * the sources they came from are at the address above.
 *
 * Requires macOS ${meta.minimumMacos} or later, and the command-line tools:
 *     brew install vips pdfcpu
 */`;
}
