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

    return {
        version: packageJson.version,
        homepage: packageJson.homepage,
        license: packageJson.license,
        copyright: packageJson.copyright.trim(),
        minimumMacos
    };
}

/*
 * The standalone artifact retains the MPL notice and the source location for
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
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 * Source Code Form: ${meta.homepage}/tree/v${meta.version}
 *
 * Generated file. Edit the sources and rebuild; changes made to this copy are
 * overwritten and are not covered by any test. Comments are stripped on build:
 * the sources they came from are at the address above.
 *
 * Requires macOS ${meta.minimumMacos} or later, and the command-line tools:
 *     brew install vips pdfcpu
 */`;
}
