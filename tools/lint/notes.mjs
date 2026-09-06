import { readFromDisk } from "./consistency.mjs";

/*
 * The CHANGELOG section for one version, for a release body.
 *
 * Taken from the CHANGELOG rather than from a per-tag notes file, because a
 * second copy of the same prose is a second thing to keep in agreement, and
 * this repository has been bitten by exactly that before.
 */

const HEADING = "## ";

// Keep a Changelog brackets the version in a release heading, and puts an
// [Unreleased] section above the newest release. Matching the brackets is
// what keeps that section from being taken for a release.
const releaseHeading = (version) => `${HEADING}[${version}]`;

/*
 * Compared as a string rather than by building a regex from the version.
 * A version is full of dots, which are regex wildcards, and the escaping that
 * was supposed to make them literal silently matched nothing — so "1.2.3"
 * would have accepted a "## 1x2y3" heading as its own.
 */
function isHeadingFor(line, version) {
    const heading = releaseHeading(version);

    if (!line.startsWith(heading)) {
        return false;
    }

    const rest = line.slice(heading.length);

    return rest === "" || rest.startsWith(" ");
}

export async function releaseNotes(version, read = readFromDisk) {
    const lines = (await read("CHANGELOG.md")).split("\n");
    const start = lines.findIndex((line) => isHeadingFor(line, version));

    if (start < 0) {
        throw new Error(`CHANGELOG.md has no section for ${version}`);
    }

    const following = lines
        .slice(start + 1)
        .findIndex((line) => line.startsWith(HEADING));

    return lines
        .slice(start, following < 0 ? lines.length : start + 1 + following)
        .join("\n")
        .trim();
}
