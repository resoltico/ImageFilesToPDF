/*
 * Prints the CHANGELOG section for a tag, for use as a release body.
 *
 * A thin entry point, like check-dist.mjs and check-tag.mjs: the rule lives
 * in tools/lint/consistency.mjs where it is unit tested and mutated.
 */
import { checkReleaseTag } from "./lint/consistency.mjs";
import { releaseNotes } from "./lint/notes.mjs";

// node, the script, then the tag.
const ARGUMENTS_START = 2;

const [tag] = process.argv.slice(ARGUMENTS_START);

if (!tag) {
    throw new Error("usage: node tools/release-notes.mjs <tag>");
}

const version = await checkReleaseTag(tag);

console.log(await releaseNotes(version));
